/**
 * Performance Monitor for BrowOS
 * 
 * Provides real-time monitoring of memory usage, GPU resources, and system performance.
 * Accessible via the Settings app.
 */

(function() {
    'use strict';

    class PerformanceMonitor {
        constructor() {
            this.metrics = {
                memory: {
                    used: 0,
                    total: 0,
                    percentage: 0
                },
                gpu: {
                    resources: 0,
                    contexts: {}
                },
                system: {
                    fps: 0,
                    lag: 0,
                    activeWindows: 0
                },
                filesystem: {
                    cacheSize: 0,
                    cacheMax: 100
                }
            };
            
            this.updateInterval = null;
            this.fpsFrames = 0;
            this.fpsLastTime = performance.now();
            this.listeners = new Set();
        }

        start() {
            if (this.updateInterval) return;
            
            this.updateInterval = setInterval(() => {
                this.updateMetrics();
                this.notifyListeners();
            }, 2000); // Update every 2 seconds
            
            // FPS monitoring
            this.monitorFPS();
        }

        stop() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
        }

        monitorFPS() {
            const measureFPS = () => {
                this.fpsFrames++;
                const currentTime = performance.now();
                
                if (currentTime >= this.fpsLastTime + 1000) {
                    this.metrics.system.fps = Math.round((this.fpsFrames * 1000) / (currentTime - this.fpsLastTime));
                    this.fpsFrames = 0;
                    this.fpsLastTime = currentTime;
                }
                
                requestAnimationFrame(measureFPS);
            };
            
            requestAnimationFrame(measureFPS);
        }

        updateMetrics() {
            // Memory usage (if available)
            if (performance.memory) {
                this.metrics.memory.used = Math.round(performance.memory.usedJSHeapSize / 1048576); // MB
                this.metrics.memory.total = Math.round(performance.memory.totalJSHeapSize / 1048576); // MB
                this.metrics.memory.percentage = Math.round((this.metrics.memory.used / this.metrics.memory.total) * 100);
            }

            // GPU resources
            if (window.GPUTracker) {
                const gpuStats = window.GPUTracker.getStats();
                this.metrics.gpu.resources = gpuStats.undisposed;
                this.metrics.gpu.contexts = gpuStats.byContext;
            }

            // System metrics
            this.metrics.system.activeWindows = window.windowManager?.windows?.length || 0;

            // Filesystem cache
            if (window.filesystem) {
                this.metrics.filesystem.cacheSize = window.filesystem.handleCache?.size || 0;
                this.metrics.filesystem.cacheMax = window.filesystem.cacheMax || 100;
            }

            // Asset manager cache
            if (window.AssetManager) {
                const assetStats = window.AssetManager.getStats();
                this.metrics.assets = {
                    cachedAssets: assetStats.cachedAssets,
                    memoryUsageMB: assetStats.memoryUsageMB,
                    memoryLimitMB: assetStats.memoryLimitMB,
                    memoryUtilization: assetStats.memoryUtilization,
                    loadingAssets: assetStats.loadingAssets,
                    byType: assetStats.byType
                };
            }

            // Lag detection (frame time)
            const lag = this.calculateLag();
            this.metrics.system.lag = lag;
        }

        calculateLag() {
            // Simple lag detection based on FPS
            const fps = this.metrics.system.fps;
            if (fps < 30) return 'High';
            if (fps < 45) return 'Medium';
            return 'Low';
        }

        onMetricsUpdate(callback) {
            this.listeners.add(callback);
            return () => this.listeners.delete(callback);
        }

        notifyListeners() {
            for (const callback of this.listeners) {
                try {
                    callback(this.getMetrics());
                } catch (e) {
                    console.warn('[PerformanceMonitor] Error in listener callback:', e);
                }
            }
        }

        getMetrics() {
            return { ...this.metrics };
        }

        getPerformanceScore() {
            // Calculate overall performance score (0-100)
            let score = 100;
            
            // Memory penalty
            if (this.metrics.memory.percentage > 80) score -= 20;
            else if (this.metrics.memory.percentage > 60) score -= 10;
            
            // FPS penalty
            if (this.metrics.system.fps < 30) score -= 30;
            else if (this.metrics.system.fps < 45) score -= 15;
            
            // GPU resource penalty
            if (this.metrics.gpu.resources > 50) score -= 20;
            else if (this.metrics.gpu.resources > 30) score -= 10;
            
            return Math.max(0, score);
        }

        getRecommendations() {
            const recommendations = [];
            
            if (this.metrics.memory.percentage > 70) {
                recommendations.push({
                    type: 'memory',
                    severity: 'high',
                    message: 'High memory usage detected. Consider closing unused windows or games.',
                    action: 'close-windows'
                });
            }
            
            if (this.metrics.system.fps < 30) {
                recommendations.push({
                    type: 'performance',
                    severity: 'high',
                    message: 'Low frame rate detected. Try reducing graphics quality or closing 3D applications.',
                    action: 'reduce-quality'
                });
            }
            
            if (this.metrics.gpu.resources > 40) {
                recommendations.push({
                    type: 'gpu',
                    severity: 'medium',
                    message: 'Many GPU resources allocated. Closing 3D games will free up memory.',
                    action: 'close-games'
                });
            }
            
            if (this.metrics.assets && this.metrics.assets.memoryUtilization > 80) {
                recommendations.push({
                    type: 'assets',
                    severity: 'medium',
                    message: 'Asset cache is nearly full. Consider clearing unused assets.',
                    action: 'clear-assets'
                });
            }
            
            if (this.metrics.filesystem.cacheSize > this.metrics.filesystem.cacheMax * 0.8) {
                recommendations.push({
                    type: 'cache',
                    severity: 'low',
                    message: 'Filesystem cache is nearly full. Cache will automatically manage itself.',
                    action: 'none'
                });
            }
            
            return recommendations;
        }
    }

    // Global singleton
    window.PerformanceMonitor = new PerformanceMonitor();

    // Auto-start monitoring
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.PerformanceMonitor.start();
        });
    } else {
        window.PerformanceMonitor.start();
    }

    // Integration with existing Settings app
    if (window.BrowAppSettings) {
        const originalInitEvents = window.BrowAppSettings.initEvents;
        window.BrowAppSettings.initEvents = function(windowElement) {
            const result = originalInitEvents?.call(this, windowElement);
            
            // Add performance section to Settings
            setTimeout(() => {
                const perfSection = windowElement.querySelector('[data-section="performance"]');
                if (!perfSection) {
                    const settingsNav = windowElement.querySelector('.settings-nav');
                    if (settingsNav) {
                        const perfButton = document.createElement('button');
                        perfButton.className = 'settings-nav-item';
                        perfButton.dataset.section = 'performance';
                        perfButton.innerHTML = '<span>⚡ Performance</span>';
                        settingsNav.appendChild(perfButton);
                        
                        perfButton.addEventListener('click', () => {
                            this.showPerformancePanel(windowElement);
                        });
                    }
                }
            }, 100);
            
            return result;
        };
        
        window.BrowAppSettings.showPerformancePanel = function(windowElement) {
            const content = windowElement.querySelector('.settings-content');
            if (!content) return;
            
            // Update active state
            windowElement.querySelectorAll('.settings-nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.section === 'performance');
            });
            
            const monitor = window.PerformanceMonitor;
            const metrics = monitor.getMetrics();
            const score = monitor.getPerformanceScore();
            const recommendations = monitor.getRecommendations();
            
            let panel = windowElement.querySelector('.performance-panel');
            if (panel) panel.remove();
            
            panel = document.createElement('div');
            panel.className = 'performance-panel settings-section';
            panel.innerHTML = `
                <h2>⚡ Performance Monitor</h2>
                
                <div class="perf-score">
                    <div class="perf-score-label">Overall Performance Score</div>
                    <div class="perf-score-value ${score >= 70 ? 'good' : score >= 40 ? 'medium' : 'poor'}">${score}/100</div>
                </div>
                
                <div class="perf-metrics">
                    <div class="perf-metric">
                        <div class="perf-metric-label">Memory Usage</div>
                        <div class="perf-metric-value">${metrics.memory.used} MB / ${metrics.memory.total} MB</div>
                        <div class="perf-metric-bar">
                            <div class="perf-metric-fill" style="width: ${metrics.memory.percentage}%"></div>
                        </div>
                    </div>
                    
                    <div class="perf-metric">
                        <div class="perf-metric-label">Frame Rate</div>
                        <div class="perf-metric-value">${metrics.system.fps} FPS</div>
                        <div class="perf-metric-bar">
                            <div class="perf-metric-fill ${metrics.system.fps >= 45 ? 'good' : metrics.system.fps >= 30 ? 'medium' : 'poor'}" style="width: ${Math.min(metrics.system.fps, 60) / 60 * 100}%"></div>
                        </div>
                    </div>
                    
                    <div class="perf-metric">
                        <div class="perf-metric-label">GPU Resources</div>
                        <div class="perf-metric-value">${metrics.gpu.resources} objects</div>
                        <div class="perf-metric-bar">
                            <div class="perf-metric-fill ${metrics.gpu.resources <= 30 ? 'good' : metrics.gpu.resources <= 50 ? 'medium' : 'poor'}" style="width: ${Math.min(metrics.gpu.resources, 100) / 100 * 100}%"></div>
                        </div>
                    </div>
                    
                    <div class="perf-metric">
                        <div class="perf-metric-label">Active Windows</div>
                        <div class="perf-metric-value">${metrics.system.activeWindows}</div>
                    </div>
                    
                    <div class="perf-metric">
                        <div class="perf-metric-label">Filesystem Cache</div>
                        <div class="perf-metric-value">${metrics.filesystem.cacheSize} / ${metrics.filesystem.cacheMax}</div>
                    </div>
                    
                    ${metrics.assets ? `
                    <div class="perf-metric">
                        <div class="perf-metric-label">Asset Cache</div>
                        <div class="perf-metric-value">${metrics.assets.memoryUsageMB} MB / ${metrics.assets.memoryLimitMB} MB</div>
                        <div class="perf-metric-bar">
                            <div class="perf-metric-fill ${metrics.assets.memoryUtilization <= 50 ? 'good' : metrics.assets.memoryUtilization <= 80 ? 'medium' : 'poor'}" style="width: ${metrics.assets.memoryUtilization}%"></div>
                        </div>
                    </div>
                    
                    <div class="perf-metric">
                        <div class="perf-metric-label">Cached Assets</div>
                        <div class="perf-metric-value">${metrics.assets.cachedAssets} (${metrics.assets.loadingAssets} loading)</div>
                    </div>
                    ` : ''}
                </div>
                
                ${recommendations.length > 0 ? `
                <div class="perf-recommendations">
                    <h3>Recommendations</h3>
                    ${recommendations.map(rec => `
                        <div class="perf-rec perf-rec-${rec.severity}">
                            <div class="perf-rec-icon">${rec.severity === 'high' ? '⚠️' : rec.severity === 'medium' ? '⚡' : 'ℹ️'}</div>
                            <div class="perf-rec-text">${rec.message}</div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                
                <div class="perf-actions">
                    <button class="perf-action-btn" data-action="refresh">Refresh Metrics</button>
                    <button class="perf-action-btn" data-action="gpu-cleanup">Force GPU Cleanup</button>
                    <button class="perf-action-btn" data-action="cache-clear">Clear Filesystem Cache</button>
                    <button class="perf-action-btn" data-action="asset-clear">Clear Asset Cache</button>
                </div>
            `;
            
            content.innerHTML = '';
            content.appendChild(panel);
            
            // Add event listeners
            panel.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
                monitor.updateMetrics();
                this.showPerformancePanel(windowElement);
            });
            
            panel.querySelector('[data-action="gpu-cleanup"]')?.addEventListener('click', () => {
                if (window.GPUTracker) {
                    window.GPUTracker.disposeAll();
                    monitor.updateMetrics();
                    this.showPerformancePanel(windowElement);
                }
            });
            
            panel.querySelector('[data-action="cache-clear"]')?.addEventListener('click', () => {
                if (window.filesystem) {
                    window.filesystem.handleCache.clear();
                    window.filesystem.cacheAccessTimes.clear();
                    monitor.updateMetrics();
                    this.showPerformancePanel(windowElement);
                }
            });
            
            panel.querySelector('[data-action="asset-clear"]')?.addEventListener('click', () => {
                if (window.AssetManager) {
                    window.AssetManager.clear();
                    monitor.updateMetrics();
                    this.showPerformancePanel(windowElement);
                }
            });
            
            // Auto-refresh every 3 seconds
            panel._refreshInterval = setInterval(() => {
                if (document.body.contains(panel)) {
                    monitor.updateMetrics();
                    this.showPerformancePanel(windowElement);
                } else {
                    clearInterval(panel._refreshInterval);
                }
            }, 3000);
        };
    }

})();
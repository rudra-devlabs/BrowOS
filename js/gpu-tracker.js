/**
 * GPU Resource Tracker for BrowOS
 * 
 * This utility helps track and properly dispose of GPU resources (Three.js objects)
 * to prevent memory leaks and improve performance in 3D applications.
 */

(function() {
    'use strict';

    class GPUResourceTracker {
        constructor() {
            this.resources = new Map();
            this.resourceId = 0;
        }

        /**
         * Track a Three.js resource for later disposal
         * @param {Object} resource - The Three.js object to track
         * @param {string} type - Resource type (geometry, material, texture, etc.)
         * @param {string} context - Optional context identifier (e.g., game name)
         */
        track(resource, type, context = 'default') {
            if (!resource) return;
            
            const id = ++this.resourceId;
            this.resources.set(id, {
                resource,
                type,
                context,
                disposed: false,
                createdAt: Date.now()
            });
            
            return id;
        }

        /**
         * Dispose a specific tracked resource
         * @param {number} id - The resource ID returned by track()
         */
        dispose(id) {
            const entry = this.resources.get(id);
            if (!entry || entry.disposed) return;

            try {
                this.disposeResource(entry.resource, entry.type);
                entry.disposed = true;
                this.resources.delete(id);
            } catch (e) {
                console.warn('[GPUTracker] Error disposing resource:', e);
            }
        }

        /**
         * Dispose all resources for a specific context
         * @param {string} context - The context identifier
         */
        disposeContext(context) {
            for (const [id, entry] of this.resources) {
                if (entry.context === context && !entry.disposed) {
                    this.dispose(id);
                }
            }
        }

        /**
         * Dispose all tracked resources
         */
        disposeAll() {
            for (const [id, entry] of this.resources) {
                if (!entry.disposed) {
                    this.dispose(id);
                }
            }
        }

        /**
         * Internal method to dispose specific resource types
         */
        disposeResource(resource, type) {
            if (!resource) return;

            switch (type) {
                case 'geometry':
                    if (resource.dispose) resource.dispose();
                    break;
                case 'material':
                    if (resource.dispose) {
                        // Dispose material and its textures
                        if (resource.map) resource.map.dispose();
                        if (resource.lightMap) resource.lightMap.dispose();
                        if (resource.aoMap) resource.aoMap.dispose();
                        if (resource.emissiveMap) resource.emissiveMap.dispose();
                        if (resource.bumpMap) resource.bumpMap.dispose();
                        if (resource.normalMap) resource.normalMap.dispose();
                        if (resource.roughnessMap) resource.roughnessMap.dispose();
                        if (resource.metalnessMap) resource.metalnessMap.dispose();
                        resource.dispose();
                    }
                    break;
                case 'texture':
                    if (resource.dispose) resource.dispose();
                    break;
                case 'renderer':
                    if (resource.dispose) resource.dispose();
                    if (resource.forceContextLoss) resource.forceContextLoss();
                    break;
                case 'scene':
                    this.disposeScene(resource);
                    break;
                default:
                    // Try generic dispose
                    if (resource.dispose) resource.dispose();
            }
        }

        /**
         * Recursively dispose a Three.js scene and all its children
         */
        disposeScene(scene) {
            if (!scene) return;

            scene.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => this.disposeResource(material, 'material'));
                    } else {
                        this.disposeResource(object.material, 'material');
                    }
                }
            });
        }

        /**
         * Get statistics about tracked resources
         */
        getStats() {
            const stats = {
                total: this.resources.size,
                byType: {},
                byContext: {},
                undisposed: 0
            };

            for (const [id, entry] of this.resources) {
                if (!entry.disposed) {
                    stats.undisposed++;
                    stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
                    stats.byContext[entry.context] = (stats.byContext[entry.context] || 0) + 1;
                }
            }

            return stats;
        }

        /**
         * Log current resource statistics
         */
        logStats() {
            const stats = this.getStats();
            console.log('[GPUTracker] Resource Statistics:', stats);
        }
    }

    // Global singleton
    window.GPUTracker = new GPUResourceTracker();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        window.GPUTracker.disposeAll();
    });

})();
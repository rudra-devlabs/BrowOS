/**
 * Dynamic Asset Manager for BrowOS
 * 
 * Handles loading, caching, and unloading of 3D models and other heavy assets
 * to optimize memory usage in games and 3D applications.
 */

(function() {
    'use strict';

    class AssetManager {
        constructor() {
            this.cache = new Map();
            this.loadingPromises = new Map();
            this.cacheMaxSize = 50; // Maximum number of cached assets
            this.cacheMaxMemoryMB = 200; // Maximum memory in MB for cached assets
            this.currentMemoryUsage = 0;
            this.accessTimes = new Map();
            this.assetId = 0;
        }

        /**
         * Load a 3D model or asset
         * @param {string} url - URL of the asset to load
         * @param {string} type - Asset type (gltf, glb, texture, etc.)
         * @param {Object} options - Loading options
         */
        async load(url, type = 'gltf', options = {}) {
            const cacheKey = this.getCacheKey(url, type);
            
            // Check cache first
            if (this.cache.has(cacheKey)) {
                this.updateAccessTime(cacheKey);
                return this.cache.get(cacheKey).data;
            }
            
            // Check if already loading
            if (this.loadingPromises.has(cacheKey)) {
                return this.loadingPromises.get(cacheKey);
            }
            
            // Load the asset
            const loadPromise = this.loadAsset(url, type, options);
            this.loadingPromises.set(cacheKey, loadPromise);
            
            try {
                const data = await loadPromise;
                const memorySize = this.estimateMemorySize(data, type);
                
                // Check memory constraints
                if (this.currentMemoryUsage + memorySize > this.cacheMaxMemoryMB * 1048576) {
                    this.evictLRU(memorySize);
                }
                
                // Cache the asset
                this.cache.set(cacheKey, {
                    data,
                    type,
                    url,
                    memorySize,
                    id: ++this.assetId
                });
                
                this.currentMemoryUsage += memorySize;
                this.updateAccessTime(cacheKey);
                
                return data;
            } finally {
                this.loadingPromises.delete(cacheKey);
            }
        }

        /**
         * Internal method to load different asset types
         */
        async loadAsset(url, type, options) {
            switch (type) {
                case 'gltf':
                case 'glb':
                    return this.loadGLTF(url, options);
                case 'texture':
                    return this.loadTexture(url, options);
                case 'json':
                    return this.loadJSON(url);
                default:
                    throw new Error(`Unknown asset type: ${type}`);
            }
        }

        /**
         * Load GLTF/GLB model using Three.js GLTFLoader
         */
        async loadGLTF(url, options) {
            if (!window.THREE || !window.THREE.GLTFLoader) {
                throw new Error('Three.js and GLTFLoader must be loaded first');
            }
            
            return new Promise((resolve, reject) => {
                const loader = new window.THREE.GLTFLoader();
                loader.load(url, (gltf) => {
                    resolve(gltf);
                }, undefined, reject);
            });
        }

        /**
         * Load texture using Three.js TextureLoader
         */
        async loadTexture(url, options) {
            if (!window.THREE) {
                throw new Error('Three.js must be loaded first');
            }
            
            return new Promise((resolve, reject) => {
                const loader = new window.THREE.TextureLoader();
                loader.load(url, (texture) => {
                    if (options?.generateMipmaps !== false) {
                        texture.generateMipmaps = true;
                    }
                    resolve(texture);
                }, undefined, reject);
            });
        }

        /**
         * Load JSON data
         */
        async loadJSON(url) {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load JSON: ${response.statusText}`);
            }
            return response.json();
        }

        /**
         * Unload a specific asset from cache
         */
        unload(url, type) {
            const cacheKey = this.getCacheKey(url, type);
            const entry = this.cache.get(cacheKey);
            
            if (entry) {
                this.disposeAsset(entry.data, entry.type);
                this.currentMemoryUsage -= entry.memorySize;
                this.cache.delete(cacheKey);
                this.accessTimes.delete(cacheKey);
                return true;
            }
            
            return false;
        }

        /**
         * Unload all assets for a specific context
         */
        unloadContext(context) {
            for (const [key, entry] of this.cache) {
                if (entry.context === context) {
                    this.disposeAsset(entry.data, entry.type);
                    this.currentMemoryUsage -= entry.memorySize;
                    this.cache.delete(key);
                    this.accessTimes.delete(key);
                }
            }
        }

        /**
         * Clear entire cache
         */
        clear() {
            for (const [key, entry] of this.cache) {
                this.disposeAsset(entry.data, entry.type);
            }
            this.cache.clear();
            this.accessTimes.clear();
            this.currentMemoryUsage = 0;
        }

        /**
         * Dispose of specific asset types
         */
        disposeAsset(data, type) {
            if (!data) return;
            
            try {
                switch (type) {
                    case 'gltf':
                    case 'glb':
                        this.disposeGLTF(data);
                        break;
                    case 'texture':
                        if (data.dispose) data.dispose();
                        break;
                    default:
                        // Try generic dispose
                        if (data.dispose) data.dispose();
                }
            } catch (e) {
                console.warn('[AssetManager] Error disposing asset:', e);
            }
        }

        /**
         * Dispose GLTF model and all its resources
         */
        disposeGLTF(gltf) {
            if (!gltf) return;
            
            const disposeNode = (node) => {
                if (!node) return;
                
                // Dispose geometry
                if (node.geometry) {
                    node.geometry.dispose();
                }
                
                // Dispose materials
                if (node.material) {
                    if (Array.isArray(node.material)) {
                        node.material.forEach(mat => this.disposeMaterial(mat));
                    } else {
                        this.disposeMaterial(node.material);
                    }
                }
                
                // Recursively dispose children
                if (node.children) {
                    node.children.forEach(child => disposeNode(child));
                }
            };
            
            if (gltf.scene) {
                disposeNode(gltf.scene);
            }
            
            if (gltf.scenes) {
                gltf.scenes.forEach(scene => disposeNode(scene));
            }
        }

        /**
         * Dispose material and its textures
         */
        disposeMaterial(material) {
            if (!material) return;
            
            // Dispose textures
            const textureProperties = [
                'map', 'lightMap', 'aoMap', 'emissiveMap', 
                'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap',
                'alphaMap', 'envMap'
            ];
            
            textureProperties.forEach(prop => {
                if (material[prop]) {
                    material[prop].dispose();
                }
            });
            
            // Dispose material
            if (material.dispose) {
                material.dispose();
            }
        }

        /**
         * Estimate memory size of an asset
         */
        estimateMemorySize(data, type) {
            // Rough estimation - in production you'd want more accurate measurement
            switch (type) {
                case 'gltf':
                case 'glb':
                    // Estimate based on scene complexity
                    let vertexCount = 0;
                    let textureCount = 0;
                    
                    const countResources = (node) => {
                        if (node.geometry) {
                            vertexCount += node.geometry.attributes.position?.count || 0;
                        }
                        if (node.material) {
                            const mats = Array.isArray(node.material) ? node.material : [node.material];
                            mats.forEach(mat => {
                                Object.values(mat).forEach(val => {
                                    if (val && val.isTexture) textureCount++;
                                });
                            });
                        }
                        if (node.children) {
                            node.children.forEach(countResources);
                        }
                    };
                    
                    if (data.scene) countResources(data.scene);
                    
                    // Rough estimate: vertices * 12 bytes + textures * 1MB average
                    return (vertexCount * 12) + (textureCount * 1048576);
                    
                case 'texture':
                    // Estimate based on texture dimensions
                    if (data.image) {
                        const { width, height } = data.image;
                        return width * height * 4; // RGBA
                    }
                    return 1048576; // 1MB default
                    
                case 'json':
                    return JSON.stringify(data).length * 2; // UTF-16
                    
                default:
                    return 1048576; // 1MB default
            }
        }

        /**
         * Evict least recently used assets to free memory
         */
        evictLRU(requiredMemory) {
            const entries = Array.from(this.cache.entries());
            
            // Sort by access time (oldest first)
            entries.sort((a, b) => {
                const timeA = this.accessTimes.get(a[0]) || 0;
                const timeB = this.accessTimes.get(b[0]) || 0;
                return timeA - timeB;
            });
            
            let freedMemory = 0;
            
            for (const [key, entry] of entries) {
                if (freedMemory >= requiredMemory) break;
                
                this.disposeAsset(entry.data, entry.type);
                this.currentMemoryUsage -= entry.memorySize;
                freedMemory += entry.memorySize;
                this.cache.delete(key);
                this.accessTimes.delete(key);
            }
        }

        /**
         * Update access time for cache entry
         */
        updateAccessTime(cacheKey) {
            this.accessTimes.set(cacheKey, Date.now());
        }

        /**
         * Generate cache key
         */
        getCacheKey(url, type) {
            return `${type}:${url}`;
        }

        /**
         * Get cache statistics
         */
        getStats() {
            return {
                cachedAssets: this.cache.size,
                memoryUsageMB: Math.round(this.currentMemoryUsage / 1048576),
                memoryLimitMB: this.cacheMaxMemoryMB,
                memoryUtilization: Math.round((this.currentMemoryUsage / (this.cacheMaxMemoryMB * 1048576)) * 100),
                loadingAssets: this.loadingPromises.size,
                byType: this.getStatsByType()
            };
        }

        /**
         * Get statistics grouped by asset type
         */
        getStatsByType() {
            const stats = {};
            
            for (const [key, entry] of this.cache) {
                const type = entry.type;
                if (!stats[type]) {
                    stats[type] = {
                        count: 0,
                        memoryMB: 0
                    };
                }
                stats[type].count++;
                stats[type].memoryMB += Math.round(entry.memorySize / 1048576);
            }
            
            return stats;
        }

        /**
         * Set cache limits
         */
        setLimits(maxSize, maxMemoryMB) {
            this.cacheMaxSize = maxSize || this.cacheMaxSize;
            this.cacheMaxMemoryMB = maxMemoryMB || this.cacheMaxMemoryMB;
            
            // Enforce new limits
            while (this.cache.size > this.cacheMaxSize) {
                this.evictLRU(0);
            }
            
            while (this.currentMemoryUsage > this.cacheMaxMemoryMB * 1048576) {
                this.evictLRU(0);
            }
        }
    }

    // Global singleton
    window.AssetManager = new AssetManager();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        window.AssetManager.clear();
    });

})();
class NetworkComponents {

    constructor(entity, data) {
        this.el = entity;
        this.data = data;
        this.cachedData = {};

        this.initNetworkId();
        this.initNetworkParent();
        this.registerEntity(this.networkId);
    }

    setData(data) {
        this.data = data;
    }

    initNetworkId() {
        this.networkId = this.data.networkId ? this.data.networkId : this.createNetworkId();
    }

    createNetworkId() {
        return Math.random().toString(36).substring(2, 9);
    }

    initNetworkParent() {
        var parentEl = this.el.parentElement;
        if (parentEl.hasOwnProperty('components') && parentEl.components.hasOwnProperty('networked')) {
            this.parent = parentEl;
        } else {
            this.parent = null;
        }
    }

    registerEntity(networkId) {
        naf.entities.registerLocalEntity(networkId, this.el);
    }

    listenForLoggedIn() {
        document.body.addEventListener('loggedIn', this.onLoggedIn.bind(this), false);
    }

    checkLoggedIn() {
        if (naf.clientId) {
            this.onLoggedIn();
        } else {
            this.listenForLoggedIn();
        }
    }

    onLoggedIn() {
        this.owner = this.data.owner || this.data.owner == '' ? this.data.owner : naf.clientId;
        this.syncAll();
    }

    setOwner(owner) {
        this.owner = owner;
    }

    isMine() {
        return naf.connection.isMineAndConnected(this.owner);
    }

    syncAll() {
        this.updateNextSyncTime();
        var allSyncedComponents = this.getAllSyncedComponents();
        var components = this.getComponentsData(allSyncedComponents);
        var syncData = this.createSyncData(components);
        naf.connection.broadcastDataGuaranteed('u', syncData);
        // console.error('syncAll', syncData);
        this.updateCache(components);
    }

    syncDirty() {
        this.updateNextSyncTime();
        var dirtyComps = this.getDirtyComponents();
        if (dirtyComps.length == 0 && !this.data.physics) {
            return;
        }
        var components = this.getComponentsData(dirtyComps);
        var syncData = this.createSyncData(components);
        if (naf.options.compressSyncPackets) {
            syncData = this.compressSyncData(syncData);
        }
        naf.connection.broadcastData('u', syncData);
        // console.log('syncDirty', syncData);
        this.updateCache(components);
    }

    needsToSync() {
        return naf.utils.now() >= this.nextSyncTime;
    }

    updateNextSyncTime() {
        this.nextSyncTime = naf.utils.now() + 1000 / naf.options.updateRate;
    }

    getComponentsData(schemaComponents) {
        var elComponents = this.el.components;
        var compsWithData = {};

        for (var i in schemaComponents) {
            var element = schemaComponents[i];

            if (typeof element === 'string') {
                if (elComponents.hasOwnProperty(element)) {
                    var name = element;
                    var elComponent = elComponents[name];
                    compsWithData[name] = elComponent.getData();
                }
            } else {
                var childKey = naf.utils.childSchemaToKey(element);
                var child = this.el.querySelector(element.selector);
                if (child) {
                    var comp = child.components[element.component];
                    if (comp) {
                        var data = element.property ? comp.data[element.property] : comp.getData();
                        compsWithData[childKey] = data;
                    } else {
                        naf.log.write('Could not find component ' + element.component + ' on child ', child, child.components);
                    }
                }
            }
        }
        return compsWithData;
    }

    getDirtyComponents() {
        var newComps = this.el.components;
        var syncedComps = this.getAllSyncedComponents();
        var dirtyComps = [];

        for (var i in syncedComps) {
            var schema = syncedComps[i];
            var compKey;
            var newCompData;

            var isRootComponent = typeof schema === 'string';

            if (isRootComponent) {
                var hasComponent = newComps.hasOwnProperty(schema)
                if (!hasComponent) {
                    continue;
                }
                compKey = schema;
                newCompData = newComps[schema].getData();
            }
            else {
                // is child component
                var selector = schema.selector;
                var compName = schema.component;
                var propName = schema.property;

                var childEl = this.el.querySelector(selector);
                var hasComponent = childEl && childEl.components.hasOwnProperty(compName);
                if (!hasComponent) {
                    continue;
                }
                compKey = naf.utils.childSchemaToKey(schema);
                newCompData = childEl.components[compName].getData();
                if (propName) { newCompData = newCompData[propName]; }
            }

            var compIsCached = this.cachedData.hasOwnProperty(compKey)
            if (!compIsCached) {
                dirtyComps.push(schema);
                continue;
            }

            var oldCompData = this.cachedData[compKey];
            if (!deepEqual(oldCompData, newCompData)) {
                dirtyComps.push(schema);
            }
        }
        return dirtyComps;
    }

    createSyncData(components) {
        var data = {
            0: 0, // 0 for not compressed
            networkId: this.networkId,
            owner: this.owner,
            takeover: this.takeover,
            template: this.data.template,
            showTemplate: this.data.showRemoteTemplate,
            parent: this.getParentId(),
            components: components
        };

        if (this.data.physics) {
            data['physics'] = NAF.physics.getPhysicsData(this.el);
        }

        return data;
    }

    getParentId() {
        this.initNetworkParent();
        if (this.parent == null) {
            return null;
        }
        var component = this.parent.components.networked;
        return component.networkId;
    }

    getAllSyncedComponents() {
        return this.data.components ? this.data.components : naf.schemas.getComponents(this.data.template);
    }

    networkUpdateHandler(data) {
        var entityData = data.detail.entityData;
        this.networkUpdate(entityData);
    }

    networkUpdate(entityData) {
        if (entityData[0] == 1) {
            entityData = this.decompressSyncData(entityData);
        }

        if (entityData.physics) {
            this.updatePhysics(entityData.physics);
        }

        this.updateComponents(entityData.components);
    }

    updateComponents(components) {
        for (var key in components) {
            if (this.isSyncableComponent(key)) {
                var data = components[key];
                if (naf.utils.isChildSchemaKey(key)) {
                    var schema = naf.utils.keyToChildSchema(key);
                    var childEl = this.el.querySelector(schema.selector);
                    if (childEl) { // Is false when first called in init
                        if (schema.property) { childEl.setAttribute(schema.component, schema.property, data); }
                        else { childEl.setAttribute(schema.component, data); }
                    }
                } else {
                    this.el.setAttribute(key, data);
                }
            }
        }
    }

    updatePhysics(physics) {
        if (physics && !this.isMine()) {
            // Check if this physics state is NEWER than the last one we updated
            // Network-Packets don't always arrive in order as they have been sent
            if (!this.lastPhysicsUpdateTimestamp || physics.timestamp > this.lastPhysicsUpdateTimestamp) {
                // TODO: CHeck if constraint is shared
                // Don't sync when constraints are applied
                // The constraints are synced and we don't want the jitter
                if (!physics.hasConstraint || !NAF.options.useLerp) {
                    NAF.physics.detachPhysicsLerp(this.el);
                    // WakeUp element - we are not interpolating anymore
                    NAF.physics.wakeUp(this.el);
                    NAF.physics.updatePhysics(this.el, physics);
                } else {
                    // Put element to sleep since we are now interpolating to remote physics data
                    NAF.physics.sleep(this.el);
                    NAF.physics.attachPhysicsLerp(this.el, physics);
                }

                this.lastPhysicsUpdateTimestamp = physics.timestamp;
            }
        }
    }

    handlePhysicsCollision(e) {
        // When a Collision happens, inherit ownership to collided object
        // so we can make sure, that my physics get propagated
        if (this.isMine()) {
            var collisionData = NAF.physics.getDataFromCollision(e);
            if (collisionData.el && collisionData.el.components["networked-share"]) {
                if (NAF.physics.isStrongerThan(this.el, collisionData.body) || collisionData.el.components["networked-share"].data.owner == "") {
                    collisionData.el.components["networked-share"].takeOwnership();
                    NAF.log.write("Networked-Share: Inheriting ownership after collision to: ", collisionData.el.id);
                }
            }
        }
    }

    /**
     Compressed packet structure:
     [
     1, // 1 for compressed
     networkId,
     ownerId,
     template,
     parent,
     {
       0: data, // key maps to index of synced components in network component schema
       3: data,
       4: data
     }
     ]
     */
    compressSyncData(syncData) {
        var compressed = [];
        compressed.push(1);
        compressed.push(syncData.networkId);
        compressed.push(syncData.owner);
        compressed.push(syncData.parent);
        compressed.push(syncData.template);

        var compMap = this.compressComponents(syncData.components);
        compressed.push(compMap);

        return compressed;
    }

    compressComponents(syncComponents) {
        var compMap = {};
        var components = this.getAllSyncedComponents();
        for (var i = 0; i < components.length; i++) {
            var name;
            if (typeof components[i] === 'string') {
                name = components[i];
            } else {
                name = naf.utils.childSchemaToKey(components[i]);
            }
            if (syncComponents.hasOwnProperty(name)) {
                compMap[i] = syncComponents[name];
            }
        }
        return compMap;
    }

    /**
     Decompressed packet structure:
     [
     0: 0, // 0 for uncompressed
     networkId: networkId,
     owner: clientId,
     parent: parentNetworkId,
     template: template,
     components: {
        position: data,
        scale: data,
        .head|||visible: data
      }
     ]
     */
    decompressSyncData(compressed) {
        var entityData = {};
        entityData[0] = 1;
        entityData.networkId = compressed[1];
        entityData.owner = compressed[2];
        entityData.parent = compressed[3];
        entityData.template = compressed[4];

        var compressedComps = compressed[5];
        var components = this.decompressComponents(compressedComps);
        entityData.components = components;

        return entityData;
    }

    decompressComponents(compressed) {
        var decompressed = {};
        for (var i in compressed) {
            var name;
            var schemaComp = this.data.components[i];

            if (typeof schemaComp === "string") {
                name = schemaComp;
            } else {
                name = naf.utils.childSchemaToKey(schemaComp);
            }
            decompressed[name] = compressed[i];
        }
        return decompressed;
    }

    isSyncableComponent(key) {
        if (naf.utils.isChildSchemaKey(key)) {
            var schema = naf.utils.keyToChildSchema(key);
            return this.hasThisChildSchema(schema);
        } else {
            return this.data.components.indexOf(key) != -1;
        }
    }

    hasThisChildSchema(schema) {
        var schemaComponents = this.data.components;
        for (var i in schemaComponents) {
            var localChildSchema = schemaComponents[i];
            if (naf.utils.childSchemaEqual(localChildSchema, schema)) {
                return true;
            }
        }
        return false;
    }

    updateCache(components) {
        for (var name in components) {
            this.cachedData[name] = components[name];
        }
    }

    remove() {
        var data = { networkId: this.networkId };
        naf.connection.broadcastData('r', data);
    }
}

module.exports = NetworkComponents;
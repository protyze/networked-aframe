var naf = require('../NafIndex');
var deepEqual = require('deep-equal');

AFRAME.registerComponent('networked-share', {
  schema: {
    template: {default: ''},
    networkId: {default: ''},
    owner: {default: ''},
    takeOwnershipEvents: {
     type: "array",
     default: ["grabbed", "touched"]
    },
    removeOwnershipEvents: {
     type: "array",
     default: []
    },
    components: {default: ['position', 'rotation']},
    physics: { default: false }
  },

  init: function() {
    this.networkComponents = new NetworkComponents(this.el, this.data);

    this.networkUpdateHandler = this.networkUpdateHandler.bind(this);
    this.networkComponents.syncDirty = this.networkComponents.syncDirty.bind(this.networkComponents);
    this.networkComponents.syncAll = this.networkComponents.syncAll.bind(this.networkComponents);
    this.takeOwnership = this.takeOwnership.bind(this);
    this.removeOwnership = this.removeOwnership.bind(this);
    this.networkComponents.handlePhysicsCollision = this.networkComponents.handlePhysicsCollision.bind(this.networkComponents);

    this.attachTemplate(this.data.template);

    this.networkComponents.checkLoggedIn();

    if (this.el.firstUpdateData) {
      this.firstUpdate();
    }

    this.takeover = false;
  },

  attachTemplate: function(template, show) {
    // TODO: Find a proper way to do this
    // The default template system doesn't make sense here:
    // we don't wan't to attach anything as a child object,
    // we wan't to create an exactly identical entity with the
    // same networkId. So that they behave exactly the same.

    // Could we use mixins as templates here?
    // Should we implement something like "componentsOnce"?
  },

  firstUpdate: function() {
    var entityData = this.el.firstUpdateData;
    this.networkComponents.networkUpdate(entityData); // updates root element only
    this.waitForTemplateAndUpdateChildren();
  },

  waitForTemplateAndUpdateChildren: function() {
    var that = this;
    var callback = function() {
      var entityData = that.el.firstUpdateData;
      that.networkComponents.networkUpdate(entityData);
    };
    // FIXME: this timeout-based stall should be event driven!!!
    setTimeout(callback, 50);
  },

  update: function() {
    if (this.data.physics) {
      this.el.addEventListener(NAF.physics.collisionEvent, this.networkComponents.handlePhysicsCollision);
    } else {
      this.el.removeEventListener(NAF.physics.collisionEvent, this.networkComponents.handlePhysicsCollision);
    }

    this.lastPhysicsUpdateTimestamp = null;
  },

  takeOwnership: function() {
    if (!this.networkComponents.isMine()) {
      this.unbindOwnerEvents();
      this.unbindRemoteEvents();

      this.data.owner = NAF.clientId;
      this.networkComponents.setOwner(this.data.owner);

      if (!this.data.physics) {
        this.detachLerp();
      } else {
        NAF.physics.detachPhysicsLerp(this.el);
        // WakeUp Element - We are not interpolating anymore
        NAF.physics.wakeUp(this.el);
      }

      this.el.emit("networked-ownership-taken");

      this.takeover = true;

      this.networkComponents.syncAll();

      this.takeover = false;

      this.bindOwnerEvents();
      this.bindRemoteEvents();

      NAF.log.write('Networked-Share: Taken ownership of ', this.el.id);
    }
  },

  removeOwnership: function() {
    // We should never really remove ownership of an element
    // until it falls into the "sleep"-State in the physics engine.
    // TODO: Sleep State handling
    if (this.networkComponents.isMine()) {
      this.unbindOwnerEvents();
      this.unbindRemoteEvents();

      this.data.owner = "";
      this.networkComponents.setOwner(this.data.owner);

      this.bindRemoteEvents();

      if (!this.data.physics) {
        // No need to attach physics lerp
        // the physics engine itself interpolates
        this.attachLerp();
      }

      this.el.emit("networked-ownership-removed");

      this.networkComponents.syncAll();

      NAF.log.write('Networked-Share: Removed ownership of ', this.el.id);
    }
  },

  updateOwnership: function(owner, takeover) {
    var ownerChanged = !(this.data.owner == owner);
    var ownerIsMe = (NAF.clientId == owner);

    if (this.networkComponents.isMine() && !ownerIsMe && ownerChanged && takeover) {
      // Somebody has stolen my ownership :/ - accept it and get over it
      this.unbindOwnerEvents();
      this.unbindRemoteEvents();

      this.data.owner = owner;
      this.networkComponents.setOwner(this.data.owner);

      this.bindRemoteEvents();

      if (!this.data.physics) {
        // No need to attach physics lerp
        // the physics engine itself interpolates
        this.attachLerp();
      }

      this.el.emit("networked-ownership-lost");

      NAF.log.write('Networked-Share: Friendly takeover of: ' + this.el.id + ' by ', this.data.owner);
    } else if (!this.networkComponents.isMine() && ownerChanged) {
      // Just update the owner, it's not me.
      this.data.owner = owner;
      this.networkComponents.setOwner(this.data.owner);

      this.el.emit("networked-ownership-changed");
      NAF.log.write('Networked-Share: Updated owner of: ' + this.el.id + ' to ', this.data.owner);
    }
  },

  attachLerp: function() {
    if (naf.options.useLerp) {
      this.el.setAttribute('lerp', '');
    }
  },

  detachLerp: function() {
    if (naf.options.useLerp) {
      this.el.removeAttribute('lerp');
    }
  },

  play: function() {
    this.bindOwnershipEvents();
    this.bindRemoteEvents();
  },

  bindOwnershipEvents: function() {
    if (this.data.takeOwnershipEvents) {
      // Register Events when ownership should be taken
      for (var i = 0; i < this.data.takeOwnershipEvents.length; i++) {
        this.el.addEventListener(this.data.takeOwnershipEvents[i], this.takeOwnership);
      }
    }

    if (this.data.removeOwnershipEvents) {
      // Register Events when ownership should be removed
      for (var i = 0; i < this.data.removeOwnershipEvents.length; i++) {
        this.el.addEventListener(this.data.removeOwnershipEvents[i], this.removeOwnership);
      }
    }
  },

  bindRemoteEvents: function() {
    this.el.addEventListener('networkUpdate', this.networkUpdateHandler);
  },

  bindOwnerEvents: function() {
    this.el.addEventListener('sync', this.networkComponents.syncDirty);
    this.el.addEventListener('syncAll', this.networkComponents.syncAll);
  },

  pause: function() {
    this.unbindOwnershipEvents();
    this.unbindRemoteEvents();
  },

  unbindOwnershipEvents: function() {
    if (this.data.takeOwnershipEvents) {
      // Unbind Events when ownership should be taken
      for (var i = 0; i < this.data.takeOwnershipEvents.length; i++) {
        this.el.removeEventListener(this.data.takeOwnershipEvents[i], this.takeOwnership);
      }
    }

    if (this.data.removeOwnershipEvents) {
      // Unbind Events when ownership should be removed
      for (var i = 0; i < this.data.removeOwnershipEvents.length; i++) {
        this.el.removeEventListener(this.data.removeOwnershipEvents[i], this.removeOwnership);
      }
    }
  },

  unbindRemoteEvents: function() {
    this.el.removeEventListener('networkUpdate', this.networkUpdateHandler);
  },

  unbindOwnerEvents: function() {
    this.el.removeEventListener('sync', this.networkComponents.syncDirty);
    this.el.removeEventListener('syncAll', this.networkComponents.syncAll);
  },

  tick: function() {
    if (this.networkComponents.isMine() && this.networkComponents.needsToSync()) {
      this.networkComponents.syncDirty();
    }
  },

  networkUpdate: function(rawData) {
    var entityData;

    if (rawData[0] == 1) {
      entityData = this.decompressSyncData(rawData);
    }

    this.updateOwnership(entityData.owner, entityData.takeover);

    this.networkComponents.networkUpdateHandler(rawData);
  },

  remove: function () {
    this.removeOwnership();

    this.networkComponents.remove();

    this.unbindOwnershipEvents();
    this.unbindOwnerEvents();
    this.unbindRemoteEvents();
  }

});

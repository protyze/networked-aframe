var naf = require('../NafIndex');
var deepEqual = require('deep-equal');
var NetworkComponents = require('../NetworkComponents.js');

AFRAME.registerComponent('networked', {
  schema: {
    template: {default: ''},
    showLocalTemplate: {default: true},
    showRemoteTemplate: {default: true},
    physics: { default: false }
  },

  init: function() {
    this.networkComponents = new NetworkComponents(this.el, this.data);

    this.attachAndShowTemplate(this.data.template, this.data.showLocalTemplate);

    this.networkComponents.checkLoggedIn();
  },

  update: function(oldData) {
    this.networkComponents.setData(this.data);
  },

  attachAndShowTemplate: function(template, show) {
    if (this.templateEl) {
      this.el.removeChild(this.templateEl);
    }

    if (!template) { return; }

    var templateChild = document.createElement('a-entity');
    templateChild.setAttribute('template', 'src:' + template);
    templateChild.setAttribute('visible', show);

    this.el.appendChild(templateChild);
    this.templateEl = templateChild;
  },

  play: function() {
    this.bindEvents();
  },

  bindEvents: function() {
    this.el.addEventListener('sync', this.networkComponents.syncDirty.bind(this.networkComponents));
    this.el.addEventListener('syncAll', this.networkComponents.syncAll.bind(this.networkComponents));
  },

  pause: function() {
    this.unbindEvents();
  },

  unbindEvents: function() {
    this.el.removeEventListener('sync', this.networkComponents.syncDirty);
    this.el.removeEventListener('syncAll', this.networkComponents.syncAll);
  },

  tick: function() {
    if (this.networkComponents.needsToSync()) {
      this.networkComponents.syncDirty();
    }
  },

  remove: function () {
    this.networkComponents.remove();
  }

});

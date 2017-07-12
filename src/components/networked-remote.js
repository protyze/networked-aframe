var naf = require('../NafIndex');

AFRAME.registerComponent('networked-remote', {
  schema: {
    template: {default: ''},
    showTemplate: {default: true},
    networkId: {default: ''},
    owner: {default: ''},
    components: {default: ['position', 'rotation']}
  },

  init: function() {
    this.networkComponents = new NetworkComponents(this.el, this.data);

    this.attachTemplate(this.data.template, this.data.showTemplate);
    this.attachLerp();

    if (this.el.firstUpdateData) {
      this.firstUpdate();
    }
  },

  update: function(oldData) {
    this.networkComponents.setData(this.data);
  },

  attachTemplate: function(template, show) {
    if (show) {
      var templateChild = document.createElement('a-entity');
      templateChild.setAttribute('template', 'src:' + template);
      this.el.appendChild(templateChild);
    }
  },

  attachLerp: function() {
    if (naf.options.useLerp) {
      this.el.setAttribute('lerp', '');
    }
  },

  firstUpdate: function() {
    var entityData = this.el.firstUpdateData;
    this.networkUpdate(entityData); // updates root element only
    this.waitForTemplateAndUpdateChildren();
  },

  waitForTemplateAndUpdateChildren: function() {
    var that = this;
    var callback = function() {
      var entityData = that.el.firstUpdateData;
      that.networkUpdate(entityData);
    };
    setTimeout(callback, 50);
  },

  play: function() {
    this.bindEvents();
  },

  bindEvents: function() {
    this.el.addEventListener('networkUpdate', this.networkComponents.networkUpdateHandler.bind(this.networkComponents));
  },

  pause: function() {
    this.unbindEvents();
  },

  unbindEvents: function() {
    this.el.removeEventListener('networkUpdate', this.networkComponents.networkUpdateHandler);
  }

});

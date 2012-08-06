Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
try {
	Components.utils.import("resource://gre/modules/AddonManager.jsm");
} catch (ex) {}
var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"].createInstance(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylish/locale/manage.properties");

function StylishStartup() {}

StylishStartup.prototype = {
	classID: Components.ID("{6ff9ed70-e673-11dc-95ff-0800200c9a66}"),
	contractID: "@stylish/startup;2",
	classDescription: "Stylish Startup",

	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsISupports, Components.interfaces.nsIObserver]),

	observe: function(aSubject, aTopic, aData) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		service.findEnabled(true, service.REGISTER_STYLE_ON_LOAD, {});
		if (typeof AddonManagerPrivate != "undefined") {
			AddonManagerPrivate.registerProvider(UserStyleManager, [{
				id: "userstyle",
				name: bundle.GetStringFromName("manageaddonstitle"),
				uiPriority: 7000,
				viewType: AddonManager.VIEW_TYPE_LIST
			}]);
		}
	}
}

// this throws and is unnecessary in firefox 4+
try {
Components.classes["@mozilla.org/categorymanager;1"].getService(Components.interfaces.nsICategoryManager).addCategoryEntry("profile-after-change", "StylishStartup", StylishStartup.prototype.contractID, true, true);
} catch (ex) {}

var turnOnOffObserver = {
	observe: function(subject, topic, data) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		service.findEnabled(true, subject.QueryInterface(Components.interfaces.nsIPrefBranch2).getBoolPref(data) ? service.REGISTER_STYLE_ON_LOAD : service.UNREGISTER_STYLE_ON_LOAD, {});
	}
}

var UserStyleManager = {

	getAddonsByTypes: function(aTypes, aCallback) {
		if (aTypes && aTypes.indexOf("userstyle") == -1) {
			aCallback([]);
			return;
		}
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		var styles = service.list(service.REGISTER_STYLE_ON_CHANGE, {});
		aCallback(styles.map(getUserStyleWrapper));
	},

	getAddonByID: function(id, callback) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		var style = service.find(id, service.REGISTER_STYLE_ON_CHANGE);
		if (style == null) {
			callback(null);
			return;
		}
		callback(getUserStyleWrapper(style));
	},

	getInstallForURL: function(url, callback, mimetype, hash, name, iconURL, version, loadGroup) {
		Components.utils.reportError("getInstallForURL not implemented for user styles.");
		throw "Not implemented";
	},

	getInstallForFile: function(file, callback, mimetype) {
		Components.utils.reportError("getInstallForFile not implemented for user styles.");
		throw "Not implemented";
	},

	getAllInstalls: function(callback) {
		callback(pendingUpdates);
	},

	getInstallsByTypes: function(types, callback) {
		callback(pendingUpdates);
	},

	installAddonsFromWebpage: function(mimetype, source, uri, installs) {
		Components.utils.reportError("installAddonsFromWebpage not implemented for user styles.");
		throw "Not implemented";
	},

	addInstallListener: function(listener) {
		Components.utils.reportError("addInstallListener not implemented for user styles.");
		throw "Not implemented";
	},
	
	removeInstallListener: function(listener) {
		Components.utils.reportError("removeInstallListener not implemented for user styles.");
		throw "Not implemented";
	},

	getAllAddons: function(callback) {
		Components.utils.reportError("getAllAddons not implemented for user styles.");
		throw "Not implemented";
	},

	getAddonsByIDs: function(ids, callback) {
		Components.utils.reportError("getAddonsByIDs not implemented for user styles.");
		throw "Not implemented";
	},

	getAddonsWithOperationsByTypes: function(types, callback) {
		Components.utils.reportError("getAddonsWithOperationsByTypes not implemented for user styles.");
		throw "Not implemented";
	},

	addAddonListener: function(listener) {
		Components.utils.reportError("addAddonListener not implemented for user styles.");
		throw "Not implemented";
	},

	removeAddonListener: function(listener) {
		Components.utils.reportError("removeAddonListener not implemented for user styles.");
		throw "Not implemented";
	}
};

function getUserStyleWrapper(style) {
	return {
		id: style.id,
		type: "userstyle",
		name: style.name,
		homepageURL: style.url,
		appDisabled: false,
		pendingOperations: AddonManager.PENDING_NONE,
		isCompatible: true,
		isPlatformCompatible: true,
		iconURL: "chrome://stylish/skin/32.png",
		size: style.code.length,
		scope: AddonManager.SCOPE_PROFILE,
		blocklistState: Components.interfaces.nsIBlocklistService.STATE_NOT_BLOCKED,
		pendingOperations: AddonManager.PENDING_NONE,
		providesUpdatesSecurely: style.updateUrl == null || style.updateUrl == "",
		version: "",
		operationsRequiringRestart: AddonManager.OP_NEEDS_RESTART_NONE,
		styleTypes: style.getTypes({}).sort().join(","),

		get optionsURL() {
			return null;
		},

		get permissions() {
			return AddonManager.PERM_CAN_UNINSTALL | (style.enabled ? AddonManager.PERM_CAN_DISABLE : AddonManager.PERM_CAN_ENABLE) | (style.updateUrl != null && style.updateUrl != "" && Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getBoolPref("extensions.stylish.updatesEnabled") ? AddonManager.PERM_CAN_UPGRADE : 0);
		},

		get isActive() {
			return !this.userDisabled;
		},

		get userDisabled() {
			return !style.enabled;
		},

		set userDisabled(val) {
			style.enabled = !val;
			style.save();
			AddonManagerPrivate.callAddonListeners(val ? "onEnabling" : "onDisabling", this, false);
		},

		get description() {
			var tagsA = style.getMeta("tag", {})
			var tags = "";
			if (tagsA.length > 0) {
				tags = bundle.formatStringFromName("tagstyledescription", [tagsA.join(", ")], 1);
			}
			var applies = this.getAppliesString();
			if (applies != "" && tags != "") {
				return applies + " \n\n" + tags;
			}
			return applies + tags;
		},

		getAppliesString: function() {
			var types = style.getTypes({});
			if (types.length == 1) {
				if (types[0] == "global") {
					return bundle.GetStringFromName("globalstyledescription");
				}
				if (types[0] == "app") {
					return bundle.GetStringFromName("appstyledescription");
				}
			}

			var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle)

			var domains = style.getMeta("domain", {});
			var urls = style.getMeta("url", {});
			var urlPrefixes = style.getMeta("url-prefix", {});
			var regexps = style.getMeta("regexp", {});

			var affects = domains.concat(urls).concat(urlPrefixes.map(function(u) { 
				return u + "*"
			})).concat(regexps.map(function(a) {
				return service.regexToSample(a);
			}));
			if (affects.length > 0) {
				return bundle.formatStringFromName("sitestyledescription", [affects.join(", ")], 1);
			}
			return "";
		},

		uninstall: function() {
			style.delete();
		},

		findUpdates: function(listener, flags) {
			style.checkForUpdates(getUserStyleObserver(this, listener));
		},

		isCompatibleWith: function(appVersion, platformVersion) {
			return true;
		},

		get applyBackgroundUpdates() {
			return parseInt(style.applyBackgroundUpdates);
		},

		set applyBackgroundUpdates(abu) {
			style.applyBackgroundUpdates = abu;
			style.save();
		}
	};
}

function getUserStyleObserver(addonItem, listener) {
	return {
		addonItem: addonItem,
		listener: listener,
		observe: function(subject, topic, data) {
			if (subject.id == this.addonItem.id) {
				switch (topic) {
					case "stylish-style-update-check-done":
						if (data == "update-available" && "onUpdateAvailable" in this.listener) {
							var installItem = {
								name: addonItem.name,
								type: "userstyle",
								state: AddonManager.STATE_AVAILABLE,
								addon: addonItem,
								existingAddon: addonItem,
								listeners: [],
								install: function() {
									this.listeners.forEach(function(l) {
										if ("onInstallStarted" in l) {
											l.onInstallStarted(this, this.addon);
										}
									}, this);
									var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
									service.find(this.existingAddon.id, service.CALCULATE_META | service.REGISTER_STYLE_ON_CHANGE).applyUpdate();
									pendingUpdates = pendingUpdates.filter(function(item) {
										return item.addon.id != this.addon.id;
									}, this);
									this.listeners.forEach(function(l) {
										if ("onInstallEnded" in l) {
											l.onInstallEnded(this, this.addon);
										}
									}, this);
								},
								cancel: function() {
									throw "Cancelling updates not implemented.";
								},
								addListener: function(listener) {
									if (this.listeners.indexOf(listener) == -1) {
										this.listeners.push(listener);
									}
								},
								removeListener: function(listener) {
									this.listeners = this.listeners.filter(function(l) {
										return l != listener;
									});
								}
							}
							if (!pendingUpdates.some(function(item) {
								return item.addon.id == installItem.addon.id;
							})) {
								pendingUpdates.push(installItem);
							}
							this.listener.onUpdateAvailable(this.addonItem, installItem);
							AddonManagerPrivate.callInstallListeners("onNewInstall", [], installItem);
						} else if ((data == "no-update-available" || data == "update-check-error") && "onNoUpdateAvailable" in this.listener) {
							this.listener.onNoUpdateAvailable(this.addonItem);
						}
						if ("onUpdateFinished" in this.listener) {
							this.listener.onUpdateFinished(this.addonItem, (data == "update-available" || data == "no-update-available") ? AddonManager.UPDATE_STATUS_NO_ERROR : AddonManager.UPDATE_STATUS_DOWNLOAD_ERROR);
						}
				}
			}
		}
	}
}

var pendingUpdates = [];


var addonsObserver = {
	observe: function(subject, topic, data) {
		var itemWrapper = getUserStyleWrapper(subject);
		switch (topic) {
			case "stylish-style-add":
				var install = {
					name: subject.name,
					type: "userstyle",
					state: AddonManager.STATE_INSTALLED,
					addon: getUserStyleWrapper(subject)
				};
				AddonManagerPrivate.callInstallListeners("onNewInstall", [], install);
				AddonManagerPrivate.callInstallListeners("onInstallStarted", [], install);
				AddonManagerPrivate.callInstallListeners("onInstallEnded", [], install, itemWrapper);
				break;
			case "stylish-style-change":
				AddonManagerPrivate.callInstallListeners("onExternalInstall", null, itemWrapper, itemWrapper, false);
				break;
			case "stylish-style-delete":
				AddonManagerPrivate.callAddonListeners("onUninstalled", itemWrapper);
				break;
		}
	}
}
var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
observerService.addObserver(addonsObserver, "stylish-style-add", false);
observerService.addObserver(addonsObserver, "stylish-style-change", false);
observerService.addObserver(addonsObserver, "stylish-style-delete", false);

Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2).addObserver("extensions.stylish.styleRegistrationEnabled", turnOnOffObserver, false);

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([StylishStartup]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([StylishStartup]);


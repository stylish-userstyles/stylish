var stylishManage = {

	filterText: "",
	strings: null,

	init: function() {
		this.strings = document.getElementById("stylishStrings");
		this.build(true);

		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(this.observer, "stylish-style-add", false);
		observerService.addObserver(this.observer, "stylish-style-change", false);
		observerService.addObserver(this.observer, "stylish-style-delete", false);
		//observerService.addObserver(this.observer, "stylish-style-update-check-done", false);

		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2);
		prefService.addObserver("extensions.stylish.styleRegistrationEnabled", this.observer, false);
		if (!prefService.getBoolPref("extensions.stylish.styleRegistrationEnabled")) {
			this.addStylesOffNotification();
		}
	},

	destroy: function() {
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.removeObserver(this.observer, "stylish-style-add");
		observerService.removeObserver(this.observer, "stylish-style-change");
		observerService.removeObserver(this.observer, "stylish-style-delete");
		//observerService.removeObserver(this.observer, "stylish-style-update-check-done");

		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2);
		prefService.removeObserver("extensions.stylish.styleRegistrationEnabled", this.observer);

		this.saveUIState();
	},

	observer: {
		observe: function(subject, topic, data) {
			if (topic == "nsPref:changed") {
				if (subject.QueryInterface(Components.interfaces.nsIPrefBranch2).getBoolPref(data)) {
					document.getElementById("styles-container").removeAllNotifications(false);
				} else {
					stylishManage.addStylesOffNotification();
				}
				return;
			}
			/*if (topic == "stylish-style-update-check-done") {
				stylishManage.updateNext();
				return;
			}*/
			var container = document.getElementById("styles");
			// check to see if we should be rebuilding (mass updates may want us to wait until the end)
			if (container.getAttribute("suspend-rebuild") == "true") {
				return;
			}
			// if we're deleting the current selection, it's no longer the current selection
			if (topic == "stylish-style-delete" && container.currentSelection && container.currentSelection.styleObject.id == subject.id) {
				container.currentSelection = null;
			}
			// don't rebuild on update because then we'd lose all the update UI
			if (data != "update") {
				stylishManage.build();
			}
		}
	},

	addStylesOffNotification: function() {
		var container = document.getElementById("styles-container");
		function callback(box, button) {
			Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2).setBoolPref("extensions.stylish.styleRegistrationEnabled", true);
		}
		container.appendNotification(stylishManage.strings.getString("styleRegistrationOff"), "stylesOff", null, container.PRIORITY_WARNING_LOW, [{label: stylishManage.strings.getString("styleRegistrationTurnOn"), accessKey: stylishManage.strings.getString("styleRegistrationTurnOn.ak"), callback: callback}]);
	},

	build: function(skipSaveUIState) {

		if (skipSaveUIState !== true) {
			this.saveUIState();
		}

		// store the previously selected id and group, if any
		var container = document.getElementById("styles");
		var previousId, previousGroupId;
		if (container.currentSelection && container.currentSelection.parentNode) {
			previousId = container.currentSelection.styleObject.id;
			if (container.currentSelection.parentNode.nodeName == "style-container") {
				previousGroupId = container.currentSelection.parentNode.id;
			}
		}

		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		var styles = service.list(service.REGISTER_STYLE_ON_CHANGE, {});

		var deck = document.getElementById("styles-deck");
		if (styles.length == 0) {
			deck.selectedIndex = 1;
			return;
		}
		deck.selectedIndex = 0;
		styles = styles.filter(this.filter);
		var fragment = document.createDocumentFragment();
		var groups = this.group(styles);
		groups.forEach(function(g) {
			// don't show empty groups
			if (g.styles.length == 0)
				return;
			// parent is what we'll dump the style items into
			var parent;
			// set up the group header, if available
			if (g.id) {
				var heading = document.createElement("style-container");
				heading.setAttribute("id", g.id);
				heading.setAttribute("label", g.label || stylishManage.strings.getString(g.id));
				heading.setAttribute("group-type", g.type);
				heading.setAttribute("group-value", g.value);
				fragment.appendChild(heading);
				parent = heading;
			} else {
				parent = fragment;
			}
			g.styles.sort(stylishManage.sortName).forEach(function(s) {
				var item = document.createElement("richlistitem");
				item.setAttribute("style-id", s.id);
				item.styleObject = s;
				parent.appendChild(item);
			});
		});

		// xbl destructors aren't called when removing, so we have to ensure things are torn down
		function removeChildren(e) {
			while (e.hasChildNodes()) {
				var child = e.firstChild;
				if (child.hasChildNodes()) {
					removeChildren(child);
				}
				if ("destroy" in child) {
					child.destroy();
				}
				e.removeChild(child);
			}	
		}
		removeChildren(container);
		
		container.appendChild(fragment);

		this.loadUIState();

		// restore the previous selection
		// restore in the correct group, if it's still there
		if (previousGroupId) {
			selectionBase = document.getElementById(previousGroupId);
			if (selectionBase) {
				selectionBase.removeAttribute("closed");
				var possibleSelections = selectionBase.getElementsByAttribute("style-id", previousId);
				if (possibleSelections.length > 0) {
					possibleSelections[0].click();
					return;
				}
			}
		}
		// restore any instance of the style
		if (previousId) {
			var newSelections = container.getElementsByAttribute("style-id", previousId);
			if (newSelections.length > 0) {
				newSelections[0].click();
			}
		}
	},

	group: function(styles) {
		var groups = [];
		var groupType = document.getElementById("styles-sort").value;
		// name is not grouped
		if (groupType == "name") {
			groups.push({styles: styles});
		// enabled goes into enabled/disabled
		} else if (groupType == "enabled") {
			var enabled = [];
			var disabled = [];
			styles.forEach(function(s) {
				if (s.enabled)
					enabled.push(s);
				else
					disabled.push(s);
			});
			groups.push({id:"groupEnabledTrue", styles: enabled, type: "enabled", value: "true"});
			groups.push({id:"groupEnabledFalse", styles: disabled, type: "enabled", value: "false"});
		// by type. styles have 0 to many types
		} else if (groupType == "type") {
			var app = [];
			var site = [];
			var global = [];
			var none = [];
			styles.forEach(function(s) {
				var types = s.getMeta("type", {});
				if (types.length == 0) {
					none.push(s);
					return;
				}
				if (types.indexOf("app") > -1)
					app.push(s);
				if (types.indexOf("global") > -1)
					global.push(s);
				if (types.indexOf("site") > -1)
					site.push(s);
			});
			groups.push({id:"groupTypeApp", styles: app, type: "type", value: "app"});
			groups.push({id:"groupTypeGlobal", styles: global, type: "type", value: "global"});
			groups.push({id:"groupTypeSite", styles: site, type: "type", value: "site"});
			groups.push({id:"groupTypeNone", styles: none, type: "type", value: ""});
		// by tag. styles have 0 to many tags
		} else if (groupType == "tag") {
			var tagGroups = {};
			var none = [];
			styles.forEach(function(s) {
				var types = s.getMeta("tag", {});
				// filter out whitespace ones. they shouldn't exist, but we need to make sure because they can hork us up
				types.filter(function(tag) {
					return !/^\s*$/.test(tag);
				}).forEach(function(tag) {
					if (tag in tagGroups)
						tagGroups[tag].push(s);
					else
						tagGroups[tag] = [s];
				});
				if (types.length == 0) {
					none.push(s);
					return;
				}
			});
			for (i in tagGroups) {
				groups.push({id:"groupTag" + i, label: i, styles: tagGroups[i], type: "tag", value: i});
			}
			groups.sort(function(a, b) {
				return stylishManage.sortAlpha(a.label, b.label);
			});
			if (none.length > 0) {
				groups.push({id:"groupTagNone", styles: none, type: "tag", value: ""});
			}
		}
		return groups;
	},

	sortName: function(a, b) {
		return stylishManage.sortAlpha(a.name, b.name);
	},

	sortAlpha: function(a, b) {
		a = a.toLowerCase();
		b = b.toLowerCase();
		if (a > b)
			return 1;
		if (b > a)
			return -1;
		return 0;
	},

	newStyle: function() {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
		style.init(null, null, null, null, null, "", false, null, null, null);
		stylishCommon.openEdit(stylishCommon.getWindowName("stylishEdit"), {style: style});
	},

	filter: function(style) {
		if (stylishManage.filterText.length == 0)
			return true;
		var filterWords = stylishManage.filterText.split(/\s+/);
		var styleWords = style.name.toLowerCase();
		var styleTypes = style.getMeta("type", {});
		var styleTags = style.getMeta("tag", {});
		return filterWords.every(function(word) {
			//straight up word match
			if (styleWords.indexOf(word) > -1)
				return true;
			//types
			if (styleTypes.indexOf(word) > -1)
				return true;
			//tags
			if (styleTags.some(function(tag) {
				return tag.indexOf(word) > -1;
			}))
				return true;
			//urls
			var url = stylishManage.convertToUrl(word);
			if (url)
				return style.appliesToUrl(url);
			return false;
		});
	},

	updateFilter: function(text) {
		this.filterText = text.toLowerCase();
		this.build();
	},

	convertToUrl: function(text) {
		//if it has a colon, it may already be an url
		if (/:/.test(text))
			return text;
		//if there's no colon and no period, we'll assume it's not a url
		if (!/\./.test(text)) {
			return null;
		}
		//if there's period but no colon, assume http
		return "http://" + text;
	},

	updateAll: function() {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		service.list(service.REGISTER_STYLE_ON_CHANGE, {}).forEach(function(style) {
			style.checkForUpdates(null);
		});
	},

	handleKeyPress: function(event) {
		if (event.keyCode != 38 && event.keyCode != 40)
			return;
		var styles = document.getElementById("styles");
		var currentSelection = styles.currentSelection;
		var nextSelection = null;
		if (!currentSelection) {
			// no previous selection, select the first one
			nextSelection = styles.firstChild;
		} else {
			var items = styles.getElementsByTagName("richlistitem");
			var index;
			for (index = 0; index < items.length; index++) {
				if (items[index] == currentSelection) {
					break;
				}
			}
			function move() {
				if (event.keyCode == 38) {
					if (index == 0) {
						return false;
					}
					index--;
				} else {
					if (index == items.length - 1) {
						return false;
					}
					index++;
				}
				return true;
			}
			while(move()) {
				var item = items[index];
				// skip over items in collapsed containers
				if (item.parentNode.nodeName != "style-container" || item.parentNode.getAttribute("closed") != "true") {
					nextSelection = item;
					break;
				}
			}
		}
		if (nextSelection) {
			nextSelection.click();
			styles.ensureElementIsVisible(nextSelection);
		}
	},

	// workaround for bug 115296
	loadUIState: function() {
		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2);
		prefService.getCharPref("extensions.stylish.closedContainers").split(" ").forEach(function(id) {
			if (id) {
				var element = document.getElementById(id);
				if (element) {
					element.setAttribute("closed", "true");
				}
			}
		});
	},

	saveUIState: function() {
		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2);
		// We can't just create a new list of ids of things that are closed because the user may have switched 
		// grouping and we wouldn't want to lose all their settings from the other grouping.
		var ids = [];
		// Check things that were closed last time, and remove them if they're open.
		prefService.getCharPref("extensions.stylish.closedContainers").split(" ").forEach(function(id) {
			if (id) {
				var element = document.getElementById(id);
				if (!element || element.getAttribute("closed") == "true") {
					ids.push(id);
				}
			}
		});
		// Now, get the ids of things that are closed that aren't in the list already.
		ids = ids.concat(Array.filter(document.getElementsByTagName("style-container"), function(element) {
			return element.getAttribute("closed") == "true";
		}).map(function(element) {
			return element.id;
		}).filter(function(id) {
			return ids.indexOf(id) == -1;
		}));
		// And save them
		prefService.setCharPref("extensions.stylish.closedContainers", ids.join(" "));
	},

	dragService: Components.classes["@mozilla.org/widget/dragservice;1"].getService().QueryInterface(Components.interfaces.nsIDragService),
	dragObserver: {
		onDragStart: function (event, transferData, action) {
			var style = event.target.styleObject;
			//var selection = document.getElementById("styles").currentSelection;
			var selection = event.target;
			var data = selection.styleObject.id + " " + selection.parentNode.getAttribute("group-value");

			transferData.data = new TransferData();
			transferData.data.addDataForFlavour("text/stylish-move", data);
		},
		getSupportedFlavours: function () {
			var flavours = new FlavourSet();
			flavours.appendFlavour("text/stylish-move");
			return flavours;
		},
		onDrop: function(event, transferData, session) {
			var data = transferData.data.split(" ");
			var styleId = data[0];
			var originalGroupValue = data[1];

			var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
			style = service.find(styleId, service.REGISTER_STYLE_ON_CHANGE | service.CALCULATE_META);

			var group = stylishManage.dragObserver.getGroup(event);
			if (!group) {
				Component.utils.reportError("Could not determine destination group.");
			}

			switch (group.getAttribute("group-type")) {
				case "enabled":
					style.enabled = group.getAttribute("group-value");
					style.save();
					break;
				case "tag":
					if (originalGroupValue != "") {
						style.removeMeta("tag", originalGroupValue);
					}
					if (group.getAttribute("group-value") != "" && style.getMeta("tag", {}).indexOf(group.getAttribute("group-value")) == -1) {
						style.addMeta("tag", group.getAttribute("group-value"));
					}
					style.save();
					break;
				default:
					Components.utils.reportError("Unknown group type - '" + group.getAttribute("group-type") + "'.");
			};
		},
		onDragOver: function (event, flavour, session) {
			var dragSession = stylishManage.dragService.getCurrentSession();
			session.canDrop = this.canDrop(event, dragSession);
		},
		canDrop: function(event, dragSession) {
			var group = stylishManage.dragObserver.getGroup(event);
			if (!group)
				return false;
			var groupValue = group.getAttribute("group-value");

			var td = nsTransferable.createTransferable();
			td.addDataFlavor("text/stylish-move");
			dragSession.getData(td, 0);
			var data = {};
			td.getTransferData("text/stylish-move", data, {});
			data = data.value.QueryInterface(Components.interfaces.nsISupportsString).data.split(" ");
			var styleId = data[0];
			var originalGroupValue = data[1];

			var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
			var style = service.find(styleId, 0);

			switch (group.getAttribute("group-type")) {
				case "enabled":
					if (style.enabled == new Boolean(groupValue)) {
						return false;
					}
					break;
				case "tag":
					if (style.getMeta("tag", {}).indexOf(groupValue) > -1) {
						return false;
					}
					break;
				default:
					return false;
			}
			return true;
		},
		getGroup: function(event) {
			var group = event.target;
			while (group && group.nodeName != "style-container") {
				group = group.parentNode;
			}
			return group;
		}

	}
};

window.addEventListener("load", function(){stylishManage.init()}, false);
window.addEventListener("unload", function(){stylishManage.destroy()}, false);


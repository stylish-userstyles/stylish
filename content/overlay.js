var stylishOverlay = {
	service: Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle),
	styleMenuItemTemplate: null,

	//cached number of global styles
	globalCount: null,

	uiElementIds: ["stylish-toolbar-button"],

	init: function() {
		stylishOverlay.STRINGS = document.getElementById("stylish-strings");
		stylishOverlay.URL_STRINGS = document.getElementById("stylish-url-strings");

		var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2);
		switch (prefService.getIntPref("extensions.stylish.firstRun")) {
			case 0:
				// show firstrun page
				if (typeof openUILinkIn != "undefined") {
					setTimeout(function() {openUILinkIn(stylishOverlay.URL_STRINGS.getString("firstrun"), "tab")}, 100);
				}
			case 2:
				// add to nav bar
				var navbar = document.getElementById("nav-bar");
				var button = document.getElementById("stylish-toolbar-button");
				if (navbar && !button) {
					var newCurrentSet = navbar.currentSet.split(",").concat(["stylish-toolbar-button"]).join(",");
					navbar.currentSet = newCurrentSet; // for immediate display
					navbar.setAttribute("currentset", newCurrentSet); // for persisting
					document.persist(navbar.id, "currentset");
					try {
						BrowserToolboxCustomizeDone(true);
					} catch (e) {
						Components.utils.reportError(e);
					}
				}
				prefService.setIntPref("extensions.stylish.firstRun", 3);
		}

		stylishOverlay.styleMenuItemTemplate = document.createElementNS(stylishCommon.XULNS, "menuitem");
		stylishCommon.domApplyAttributes(stylishOverlay.styleMenuItemTemplate, {
			"type": "checkbox",
			"class": "style-menu-item",
			"context": "stylish-style-context"
		});

		// sets attributes for 24-based hour of the day
		function updateTimes() {
			var date = new Date();
			document.documentElement.setAttribute("stylish-hour", date.getHours());
			document.documentElement.setAttribute("stylish-day", date.getDay());
			document.documentElement.setAttribute("stylish-date", date.getDate());
			document.documentElement.setAttribute("stylish-month", date.getMonth() + 1);
		}
		// once a minute
		setInterval(updateTimes, 1000 * 60);
		// now
		updateTimes();

		// the ways the current url can change:
		if (typeof gBrowser != "undefined") {
			// document loads
			gBrowser.addProgressListener(stylishOverlay.urlLoadedListener);
			// tab changes
			// already covered by location changes?
			gBrowser.tabContainer.addEventListener("TabSelect", stylishOverlay.urlUpdated, false);
			//document.addEventListener("TabOpen", function(){setTimeout(stylishOverlay.urlUpdated,10)}, false);
		}
		// on a new browser
		stylishOverlay.urlUpdated();

		// app info for styling
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		document.documentElement.setAttribute("stylish-platform", window.navigator.platform);
		document.documentElement.setAttribute("stylish-application", appInfo.name);
		document.documentElement.setAttribute("stylish-application-version", appInfo.version);

		// other things that can change the status:

		// global on/off pref
		prefService.addObserver("extensions.stylish.styleRegistrationEnabled", stylishOverlay, false);

		// style add/delete
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(stylishOverlay, "stylish-style-add", false);
		observerService.addObserver(stylishOverlay, "stylish-style-change", false);
		observerService.addObserver(stylishOverlay, "stylish-style-delete", false);
	},

	destroy: function() {
		if (typeof gBrowser != "undefined") {
			gBrowser.removeProgressListener(stylishOverlay.urlLoadedListener, Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT); 
		}
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.removeObserver(stylishOverlay, "stylish-style-add");
		observerService.removeObserver(stylishOverlay, "stylish-style-change");
		observerService.removeObserver(stylishOverlay, "stylish-style-delete");
	},

	observe: function(subject, topic, data) {
		//clear global count cache
		stylishOverlay.globalCount = null;
		stylishOverlay.updateStatus();
	},

	urlLoadedListener: {
		QueryInterface: function(aIID) {
			if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
				aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
				aIID.equals(Components.interfaces.nsISupports))
				return this;
			throw Components.results.NS_NOINTERFACE; 
		},
		onLocationChange: function(progress, request, uri) {
			// only if it's the current tab
			if (uri && uri.spec == content.document.location.href) {
				stylishOverlay.urlUpdated();
			}
		},
		onStateChange: function() {},
		onProgressChange: function() {},
		onStatusChange: function() {},
		onSecurityChange: function() {},
		onLinkIconAvailable: function() {}
	},

	// some of reasons this will be called overlap, so make sure we're not doing extra work
	lastUrl: null,

	urlUpdated: function() {
		if (stylishOverlay.lastUrl == content.location.href)
			return;
		stylishOverlay.lastUrl = content.location.href;
		document.documentElement.setAttribute("stylish-url", content.location.href);
		try {
			if (content.document.domain)
				document.documentElement.setAttribute("stylish-domain", content.document.domain);
			else
				document.documentElement.setAttribute("stylish-domain", "");
		} catch (ex) {
				document.documentElement.setAttribute("stylish-domain", "");
		}
		stylishOverlay.updateStatus();
	},

	updateStatus: function() {
		function updateAttribute(value) {
			stylishOverlay.uiElementIds.forEach(function(id) {
				var e = document.getElementById(id);
				if (e) {
					e.setAttribute("styles-applied", value);
				}
			});
		}

		function updateTooltip(string) {
			var tooltip = document.getElementById("stylish-tooltip").firstChild;
			while (tooltip.hasChildNodes()) {
				tooltip.removeChild(tooltip.lastChild);
			}
			tooltip.appendChild(document.createTextNode(string));
		}

		if (!Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2).getBoolPref("extensions.stylish.styleRegistrationEnabled")) {
			updateAttribute("styles-off");
			updateTooltip(stylishOverlay.STRINGS.getString("tooltipStylesOff"));
			return;
		}

		function isEnabled(style) {
			return style.enabled;
		}

		var siteStyles = stylishOverlay.service.findForUrl(content.location.href, false, 0, {}).filter(isEnabled).length;

		if (stylishOverlay.globalCount == null)
			stylishOverlay.globalCount = stylishOverlay.service.findByMeta("type", "global", 0, {}).filter(isEnabled).length;

		var attributeValues = [];
		if (siteStyles)
			attributeValues.push("site");
		if (stylishOverlay.globalCount)
			attributeValues.push("global");
		updateAttribute(attributeValues.join(" "));

		updateTooltip(stylishOverlay.STRINGS.getFormattedString("tooltip", [siteStyles, stylishOverlay.globalCount]));
	},

	toggleStyle: function(style) {
		style.enabled = !style.enabled;
		style.save();
	},

	writeStylePopupShowing: function(event) {
		var popup = event.target;
		var addSite = document.createElementNS(stylishCommon.XULNS, "menuitem");
		addSite.setAttribute("label", stylishOverlay.STRINGS.getString("writeforsite"));
		addSite.setAttribute("accesskey", stylishOverlay.STRINGS.getString("writeforsiteaccesskey"));
		addSite.addEventListener("command", stylishOverlay.addSite, false);
		popup.appendChild(addSite);

		var domain = null;
		try {
			domain = content.document.domain;
		} catch (ex) {}
		if (domain) {
			var domains = [];
			stylishOverlay.getDomainList(content.document.domain, domains);
			for (var i = 0; i < domains.length; i++) {
				popup.appendChild(stylishOverlay.getDomainMenuItem(domains[i]));
			}
		}

		addSite = document.createElementNS(stylishCommon.XULNS, "menuitem");
		addSite.setAttribute("label", stylishOverlay.STRINGS.getString("writeblank"));
		addSite.setAttribute("accesskey", stylishOverlay.STRINGS.getString("writeblankaccesskey"));
		addSite.addEventListener("command", function() {stylishOverlay.addCode('')}, false);
		popup.appendChild(addSite);
	},

	popupShowing: function(event) {
		var popup = event.target;

		if (popup.id != "stylish-popup") {
			return;
		}

		if (popup.triggerNode) {
			popup.triggerNode.setAttribute("open", "true");
		}

		//popup.position = document.popupNode.nodeName == "toolbarbutton" ? "after_start" : "";

		//XXX fix for non-browsers (maybe list everything?)
		var menuitems = stylishOverlay.service.findForUrl(content.location.href, true, stylishOverlay.service.REGISTER_STYLE_ON_CHANGE, {}).map(function(style, index) {
			var menuitem = stylishOverlay.styleMenuItemTemplate.cloneNode(true);
			menuitem.addEventListener("command", function(event) {stylishOverlay.toggleStyle(this.stylishStyle);event.stopPropagation();}, false);
			stylishCommon.domApplyAttributes(menuitem, {
				"label": style.name,
				"checked": style.enabled,
				"style-type": style.getTypes({}).join(" ")
			});		
			if (index < 9) {
				menuitem.setAttribute("accesskey", index + 1);
			}
			menuitem.stylishStyle = style;
			return menuitem;
		});
		if (menuitems.length > 0) {
			var separator = document.createElementNS(stylishCommon.XULNS, "menuseparator");
			separator.className = "stylish-menuseparator";
			popup.appendChild(separator);
		}
		menuitems.forEach(function(menuitem) {
			popup.appendChild(menuitem);
		});

		//you can only add CSS files
		document.getElementById("stylish-add-file").style.display = (content.document.contentType == "text/css") ? "-moz-box" : "none";
		var stylesOn = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getBoolPref("extensions.stylish.styleRegistrationEnabled");
		document.getElementById("stylish-turn-on").style.display = stylesOn ? "none" : "-moz-box";
		document.getElementById("stylish-turn-off").style.display = stylesOn ? "-moz-box" : "none";
	},

	popupHiding: function(event) {
		var popup = event.target;
		if (popup.triggerNode) {
			popup.triggerNode.removeAttribute("open");
		}
		stylishOverlay.clearStyleMenuItems(event);
	},

	getDomainList: function(domain, array) {
		//don't want to list tlds
		if (Components.interfaces.nsIEffectiveTLDService) {
			try {
				var tld = Components.classes["@mozilla.org/network/effective-tld-service;1"].getService(Components.interfaces.nsIEffectiveTLDService);
				if (Components.ID('{b07cb0f0-3394-572e-6260-dbaed0a292ba}').equals(Components.interfaces.nsIStyleSheetService)) {	
					if (domain.length <= tld.getEffectiveTLDLength(domain)) {
						return;
					}
				} else {
					if (domain == tld.getPublicSuffixFromHost(domain)) {
						return;
					}
				}
			} catch(ex) { 
				//this can happen if it's an ip address
				return;
			}
		}
		array[array.length] = domain;
		var firstDot = domain.indexOf(".");
		var lastDot = domain.lastIndexOf(".");
		if (firstDot != lastDot) {
			//if after the last dot it's a number, this is an ip address, so it's not part of a domain
			if (!isNaN(parseInt(domain.substring(lastDot + 1, domain.length), 10))) {
				return;
			}
			stylishOverlay.getDomainList(domain.substring(firstDot + 1, domain.length), array);
		}
	},

	getDomainMenuItem: function(domain) {
		var addSite = document.createElementNS(stylishCommon.XULNS, "menuitem");
		addSite.setAttribute("label", stylishOverlay.STRINGS.getFormattedString("writefordomain", [domain]));
		addSite.addEventListener("command", function() {stylishOverlay.addDomain(domain);}, false);
		return addSite;
	},

	findStyle: function(e) {
		openUILinkIn(stylishOverlay.URL_STRINGS.getFormattedString("findstylesforthissiteurl", [encodeURIComponent(content.location.href)]), "tab");
	},

	menuItemClassesToClear: ["stylish-menuseparator", "style-menu-item", "no-style-menu-item"],
	clearStyleMenuItems: function(event) {
		var popup = event.target;
		for (var i = popup.childNodes.length - 1; i >= 0; i--) {
			for (var j = 0; j < stylishOverlay.menuItemClassesToClear.length; j++) {
				if (popup.childNodes[i].className.indexOf(stylishOverlay.menuItemClassesToClear[j]) != -1) {
					popup.removeChild(popup.childNodes[i]);
					break;
				}
			}
		}
	},

	addSite: function() {
		var url = content.location.href;
		var namespaceURI = content.document.documentElement.namespaceURI;
		var code = "@namespace url(" + namespaceURI + ");\n\n@-moz-document url(\"" + url + "\") {\n\n}";
		stylishOverlay.addCode(code);
	},

	addDomain: function(domain) {
		var code = "@namespace url(http://www.w3.org/1999/xhtml);\n\n@-moz-document domain(\"" + domain + "\") {\n\n}";
		stylishOverlay.addCode(code);
	},

	addCode: function(code) {
		stylishCommon.addCode(code);
	},

	openManage: function() {
		function getWindow(name) {
			return Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow(name);
		}
		if (typeof BrowserOpenAddonsMgr != "undefined") {
			BrowserOpenAddonsMgr("addons://list/userstyle");
		} else if (typeof toEM != "undefined") {
			toEM("addons://list/userstyle");
		} else if (typeof openAddonsMgr != "undefined") {
			openAddonsMgr("addons://list/userstyle");
		} else {
			var em = getWindow("Extension:Manager");
			if (em) {
				em.document.getElementById("userstyles-view").click();
				em.focus();
				return;
			}
			window.openDialog("chrome://mozapps/content/extensions/extensions.xul", "", "chrome,menubar,extra-chrome,toolbar,dialog=no,resizable", "userstyles");
		}
	},

	showApplicableContextItems: function(event) {
		var style = document.popupNode.stylishStyle;
		document.getElementById("stylish-style-context-enable").hidden = style.enabled;
		document.getElementById("stylish-style-context-disable").hidden = !style.enabled;
	},

	contextSetEnabled: function(enabled) {
		var style = document.popupNode.stylishStyle;
		style.enabled = enabled;
		style.save();
	},

	contextEdit: function() {
		stylishCommon.openEditForStyle(document.popupNode.stylishStyle);
	},

	contextDelete: function() {
		stylishCommon.deleteWithPrompt(document.popupNode.stylishStyle);
	},

	turnOnOff: function(on) {
		Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).setBoolPref("extensions.stylish.styleRegistrationEnabled", on);
	},

	handleStatusClick: function(event) {
		//open manage styles on middle click
		if (event.target.id == "stylish-toolbar-button" && event.button == 1) {
			stylishOverlay.openManage();
		}
	},

	installFromFile: function(event) {
		var doc = content.document;
		stylishCommon.installFromString(doc.body.textContent, doc.location.href);
	}
};

addEventListener("load", stylishOverlay.init, false);
addEventListener("unload", stylishOverlay.destroy, false);


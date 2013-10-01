var stylishCommon = {

	XULNS: "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",

	//compares CSS, taking into account platform differences
	cssAreEqual: function(css1, css2) {
		if (css1 == null && css2 == null) {
			return true;
		}
		if (css1 == null || css2 == null) {
			return false;
		}
		return css1.replace(/\s/g, "") == css2.replace(/\s/g, "");
	},

	domApplyAttributes: function(element, json) {
		for (var i in json)
			element.setAttribute(i, json[i]);
	},

	dispatchEvent: function(doc, type) {
		if (!doc) {
			return;
		}
		var stylishEvent = doc.createEvent("Events");
		stylishEvent.initEvent(type, false, false, doc.defaultView, null);
		doc.dispatchEvent(stylishEvent);
	},

	getAppName: function() {
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		return appInfo.name;
	},

	deleteWithPrompt: function(style) {
		const STRINGS = document.getElementById("stylish-common-strings");
		var title = STRINGS.getString("deleteStyleTitle");
		var prompt = STRINGS.getFormattedString("deleteStyle", [style.name]);
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		if (prompts.confirmEx(window, title, prompt, prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING + prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL, STRINGS.getString("deleteStyleOK"), null, null, null, {})) {
			return false;
		}
		style.delete();
		return true;
	},

	fixXHR: function(request) {
		//only a problem on 1.9 toolkit
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"].getService(Components.interfaces.nsIVersionComparator);
		if (versionChecker.compare(appInfo.version, "1.9") >= 0 && versionChecker.compare(appInfo.version, "1.9.3a1pre") <= 0) {
			//https://bugzilla.mozilla.org/show_bug.cgi?id=437174
			var ds = Components.classes["@mozilla.org/webshell;1"].createInstance(Components.interfaces.nsIDocShellTreeItem).QueryInterface(Components.interfaces.nsIInterfaceRequestor);
			ds.itemType = Components.interfaces.nsIDocShellTreeItem.typeContent;
			request.channel.loadGroup = ds.getInterface(Components.interfaces.nsILoadGroup);
			request.channel.loadFlags |= Components.interfaces.nsIChannel.LOAD_DOCUMENT_URI;
		}
	},

	getWindowName: function(prefix, id) {
		return (prefix + (id || Math.random())).replace(/\W/g, "");
	},

	clearAllMenuItems: function(event) {
		var popup = event.target;
		for (var i = popup.childNodes.length - 1; i >= 0; i--) {
			var child = popup.childNodes[i];
			if (child.getAttribute("stylish-dont-clear") != "true") {
				popup.removeChild(child);
			}
		}
	},

	focusWindow: function(name) {
		//if a window is already open, openDialog will clobber the changes made. check for an open window for this style and focus to it
		var windowsMediator = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var win = windowsMediator.getMostRecentWindow(name);
		if (win) {
			win.focus();
			return true;
		}
		return false;
	},

	openEdit: function(name, params) {
		if (stylishCommon.focusWindow(name)) {
			return;
		}
		params.windowType = name;
		return openDialog("chrome://stylish/content/edit.xul", name, "chrome,resizable,dialog=no,centerscreen", params);		
	},

	openEditForStyle: function(style) {
		return stylishCommon.openEdit(stylishCommon.getWindowName("stylishEdit", style.id), {style: style});
	},

	openEditForId: function(id) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		var style = service.find(id, service.REGISTER_STYLE_ON_CHANGE | service.CALCULATE_META);
		return stylishCommon.openEditForStyle(style);
	},
	
	installFromUrl: function(url, callback) {
		// Valid URLs can retrived a CSS file or a HTML file. We'll try HTML first, and if the
		// content type comes back as CSS, we'll do that instead. These need to be separate requests
		// because setting responseType to document (for HTML parsing) prevents access to responseText.
		stylishCommon.installFromUrlHtml(url, function(result) {
			if (result == "css") {
				stylishCommon.installFromUrlCss(url, callback);
				return;
			}
			callback(result);
		});
	},

	installFromUrlHtml: function(url, callback) {
		var xhr = new XMLHttpRequest();
		xhr.onload = function() {
			if (this.status != 200) {
				Components.utils.reportError("Stylish install from URL '" + url + "' resulted in HTTP error code " + this.status + ".");
				callback("failure");
				return;
			}
			var contentType = this.getResponseHeader("Content-Type");
			if (contentType.indexOf("text/css") == 0) {
				callback("css");
				return;
			}
			if (contentType.indexOf("text/html") == 0) {
				stylishCommon.installFromSite(this.responseXML, callback);
				return;
			}
			Components.utils.reportError("Stylish install from URL '" + url + "' resulted in unknown content type " + contentType + ".");
			callback("failure");
		}
		try {
			xhr.open("GET", url);
		} catch (ex) {
			// invalid url
			Components.utils.reportError("Stylish install from URL '" + url + "' failed - not a valid URL.");
			callback("failure");
			return;
		}
		xhr.responseType = "document";
		xhr.send();
	},

	installFromUrlCss: function(url, callback) {
		var xhr = new XMLHttpRequest();
		xhr.onload = function() {
			if (xhr.status >= 400) {
				Components.utils.reportError("Stylish install from URL '" + url + "' resulted in HTTP error code " + this.status + ".");
				callback("failure");
				return;
			}
			stylishCommon.installFromString(this.responseText, url, callback);
		}
		xhr.open("GET", url);
		xhr.send();
	},
	
	// Callback passes a string parameter - installed, failure, cancelled, existing
	installFromSite: function(doc, callback) {
		var resourcesNeeded = [{name: "stylish-code", download: true}, {name: "stylish-description", download: true}, {name: "stylish-install-ping-url"}, {name: "stylish-update-url"}, {name: "stylish-md5-url"}, {name: "stylish-id-url"}];
		
		stylishCommon.getResourcesFromMetas(doc, resourcesNeeded, function(results) {
			// This is the only required property
			if (results["stylish-code"] == null || results["stylish-code"].length == 0) {
				callback("failure")
				return;
			}
			var uri = stylishCommon.cleanURI("documentURI" in doc ? doc.documentURI : doc.location.href);
			if (results["stylish-id-url"] == null) {
				results["stylish-id-url"] = uri
			}

			var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
			style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
			style.init(uri, results["stylish-id-url"], results["stylish-update-url"], results["stylish-md5-url"], results["stylish-description"], results["stylish-code"], false, results["stylish-code"], null);

			if (typeof stylishStrings != "undefined") {
				// stylishStrings is set in overlay-mobile.xul, in which case XUL is not available
				var installPrompt = stylishInstallOverlay.INSTALL_STRINGS.formatStringFromName("installintro", [style.name], 1);
				var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
				if (promptService.confirm(window, stylishStrings.title, installPrompt)) {
					style.enabled = true;
					style.save();
					if (installPingURL) {
						var req = new XMLHttpRequest();
						req.open("GET", installPingURL, true);
						stylishCommon.fixXHR(req);
						req.send(null);
					}
					callback("installed")
				}
			} else {
				stylishCommon.openInstall({style: style, installPingURL: results["stylish-install-ping-url"], installCallback: callback});
			}

		});
	},
	
	// Results the value of the <link> with a "rel" of the passed name.
	getMeta: function(doc, name) {
		var e = doc.querySelector("link[rel='" + name + "']");
		return e ? e.getAttribute("href") : null;
	},
	
	// Gets the values of the passed meta names.
	//   doc
	//   resourcesToGet: an array of:
	//     name: meta name to get
	//     download: if true, will download if the value is a remote URL
	//   callback: called with a hash of name to value
	getResourcesFromMetas: function(doc, resourcesToGet, callback) {
		var keyUrls = {};
		var resourcesToDownload = [];
		resourcesToGet.forEach(function(r) {
			var c = stylishCommon.getMeta(doc, r.name);
			if (r.download) {
				resourcesToDownload.push({name: r.name, url: c});
			} else {
				keyUrls[r.name] = c;
			}
		});
		stylishCommon.getResources(doc, resourcesToDownload, function(results) {
			results.forEach(function(r) {
				keyUrls[r.name] = r.value;
			});
			callback(keyUrls);
		});
	},
	
	// Gets the values of the passed URLs.
	//   doc
	//   resources: an array of:
	//     name: name of the resource
	//     url: url of the resource
	//   callback: called with a hash of name to value
	getResources: function(doc, resources, callback) {
		var results = [];
		
		function assembleResults(name, value) {
			results.push({name: name, value: value});
			if (results.length == resources.length) {
				callback(results);
			}
		}
		
		resources.forEach(function(resource) {
			stylishCommon.getResource(doc, resource.name, resource.url, assembleResults);
		});
	},
	
	// Get the value of the passed URL.
	getResource: function(doc, name, url, callback) {
		if (url == null) {
			callback(name, null);
			return;
		}
		if (url.indexOf("#") == 0) {
			callback(name, doc.getElementById(url.substring(1)).textContent);
			return;
		}
		var xhr = new XMLHttpRequest();
		xhr.onload = function() {
			if (xhr.status >= 400) {
				callback(name, null);
			} else {
				callback(name, xhr.responseText);
			}
		}
		if (url.length > 2000) {
			var parts = url.split("?");
			xhr.open("POST", parts[0], true);
			xhr.setRequestHeader("Content-type","application/x-www-form-urlencoded");
			xhr.send(parts[1]);
		} else {
			xhr.open("GET", url, true);
			xhr.send();
		}
	},
	
	installFromFile: function(doc) {
		stylishCommon.installFromString(doc.body.textContent, doc.location.href);
	},
	
	installFromString: function(css, uri, callback) {
		uri = stylishCommon.cleanURI(uri);
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
		style.init(uri, uri, uri, null, null, css, false, css, null);
		stylishCommon.openInstall({style: style, installCallback: callback});
	},

	openInstall: function(params) {
		// let's check if it's already installed
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		if (service.findByUrl(params.style.idUrl, 0) != null) {
			if (params.installCallback) {
				params.installCallback("existing");
			}
			return;
		}
		
		function fillName(prefix) {
			params.windowType = stylishCommon.getWindowName(prefix, params.triggeringDocument ? stylishCommon.cleanURI(params.triggeringDocument.location.href) : null);
		}
		if (Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getBoolPref("extensions.stylish.editOnInstall")) {
			fillName("stylishEdit");
			stylishCommon.openEdit(params.windowType, params);
		} else {
			fillName("stylishInstall");
			if (!stylishCommon.focusWindow(params.windowType)) {
				openDialog("chrome://stylish/content/install.xul", params.windowType, "chrome,resizable,dialog=no,centerscreen,resizable", params);
			}
		}
	},

	cleanURI: function(uri) {
		var hash = uri.indexOf("#");
		if (hash > -1) {
			uri = uri.substring(0, hash);
		}
		return uri;
	},

	// Removes whitespace and duplicate tags. Pass in a string and receive an array.
	cleanTags: function(tags) {
		tags = tags.split(/[\s,]+/);
		var uniqueTags = [];
		tags.filter(function(tag) {
			return !/^\s*$/.test(tag);
		}).forEach(function(tag) {
			if (!uniqueTags.some(function(utag) {
				return utag.toLowerCase() == tag.toLowerCase();
			})) {
				uniqueTags.push(tag);
			}
		});
		return uniqueTags;
	},

	addCode: function(code) {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
		style.init(null, null, null, null, null, code, false, null, null);
		stylishCommon.openEdit(stylishCommon.getWindowName("stylishEdit"), {style: style});
	},

	generateSelectors: function(node) {
		if (!(node instanceof Element)) {
			return;
		}

		var selectors = [];
		//element selector
		selectors.push(node.nodeName);
		//id selector
		if (node.hasAttribute("id")) {
			selectors.push("#" + node.getAttribute("id"));
		}
		//class selector
		if (node.hasAttribute("class")) {
			var classes = node.getAttribute("class").split(/\s+/);
			selectors.push("." + classes.join("."));
		}
		//attribute selectors. it's pointless to create a complicated attribute selector including an id or only a class
		if (node.attributes.length > 1 || (node.attributes.length == 1 && node.attributes[0].name != "id" && node.attributes[0].name != "class")) {
			var selector = node.nodeName;
			for (var i = 0; i < node.attributes.length; i++) {
				if (node.attributes[i].name != "id") {
					selector += "[" + node.attributes[i].name + "=\"" + node.attributes[i].value + "\"]";
				}
			}
			selectors.push(selector);
		}
		//position selector - worthless if we have an id
		if (!node.hasAttribute("id") && node != node.ownerDocument.documentElement) {
			selectors.push(stylishCommon.getPositionalSelector(node));
		}

		return selectors;
	},

	getPositionalSelector: function(node) {
		if (node instanceof Document) {
			return "";
		}
		if (node.hasAttribute("id")) {
			return "#" + node.getAttribute("id");
		}
		//are we the only child of the parent with this node name?
		var uniqueChild = true;
		var nodeName = node.nodeName;
		for (var i = 0; i < node.parentNode.childNodes.length; i++) {
			var currentNode = node.parentNode.childNodes[i];
			//css ignores everything but elements
			if (!(currentNode instanceof Element)) {
				continue;
			}
			if (node != currentNode && node.nodeName == currentNode.nodeName) {
				uniqueChild = false;
				break;
			}
		}
		if (uniqueChild) {
			return stylishCommon.getParentPositionalSelector(node) + node.nodeName;
		}
		//are we the first child?
		if (stylishCommon.isCSSFirstChild(node)) {
			return stylishCommon.getParentPositionalSelector(node) + node.nodeName + ":first-child";
		}
		//are we the last child?
		if (stylishCommon.isCSSLastChild(node)) {
			return stylishCommon.getParentPositionalSelector(node) + node.nodeName + ":last-child";
		}
		//get our position among our siblings
		var elementPosition = 1;
		var selectorWithinSiblings = "";
		for (var i = 0; i < node.parentNode.childNodes.length; i++) {
			var currentNode = node.parentNode.childNodes[i];
			//css ignores everything but elements
			if (!(currentNode instanceof Element)) {
				continue;
			}
			if (currentNode == node) {
				break;
			}
			elementPosition++;
		}
		return stylishCommon.getParentPositionalSelector(node) + node.nodeName + ":nth-child(" + elementPosition + ")";
	},

	isCSSFirstChild: function(node) {
		for (var i = 0; i < node.parentNode.childNodes.length; i++) {
			var currentNode = node.parentNode.childNodes[i];
			if (currentNode instanceof Element) {
				return currentNode == node;
			}
		}
		return false;
	},

	isCSSLastChild: function(node) {
		for (var i = node.parentNode.childNodes.length - 1; i >= 0 ; i--) {
			var currentNode = node.parentNode.childNodes[i];
			if (currentNode instanceof Element) {
				return currentNode == node;
			}
		}
		return false;
	},

	getParentPositionalSelector: function(node) {
		if (node.parentNode instanceof Document) {
			return "";
		}
		return stylishCommon.getPositionalSelector(node.parentNode) + " > ";
	}
}

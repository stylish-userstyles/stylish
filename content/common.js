var EXPORTED_SYMBOLS = ["stylishCommon"];

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

	getAppName: function() {
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		return appInfo.name;
	},
	
	isXULAvailable: Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).widgetToolkit.toLowerCase() != "android",

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

	/* Open the edit dialog.
	 *   name: a window name - if that window is already open, it will be focuss
	 *   params: a hash containing style
	 *   win: (optional) a window object to use in case there isn't one on the global scope
	 */
	openEdit: function(name, params, win) {
		if (stylishCommon.focusWindow(name)) {
			return;
		}
		if (!win) {
			win = window;
		}
		params.windowType = name;
		return win.openDialog("chrome://stylish/content/edit.xul", name, "chrome,resizable,dialog=no,centerscreen", params);
	},

	openEditForStyle: function(style) {
		return stylishCommon.openEdit(stylishCommon.getWindowName("stylishEdit", style.id), {style: style});
	},

	openEditForId: function(id) {
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		var style = service.find(id, service.REGISTER_STYLE_ON_CHANGE | service.CALCULATE_META);
		return stylishCommon.openEditForStyle(style);
	},

	// Callback passes a string parameter - installed, failure, cancelled, existing
	installFromSite: function(doc, callback) {
		stylishFrameUtils.gatherStyleInfo(doc, function(results) {stylishCommon.installFromStyleInfo(results, callback);});
	},

	/* Fire the install process based on a hash of style info.
	 *   results: the hash of style info
	 *   callback: the callback to fire when the style is installed. Will be fired with one of: installed, existing, cancelled, failure
	 *   win: (optional) a window object to use in case there isn't one on the global scope
	 */
	installFromStyleInfo: function(results, callback, win) {
		if (results == null) {
			callback("failure");
			return;
		}
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
		style.init(results["uri"], results["stylish-id-url"], results["stylish-update-url"], results["stylish-md5-url"], results["stylish-description"], results["stylish-code"], false, results["stylish-code"], results["stylish-md5"], null);
		stylishCommon.openInstall({style: style, installPingURL: results["stylish-install-ping-url"], installCallback: callback}, win);
	},

	// Installing from URLs, with prompting and UI and such. startedCallback is called after the user has entered their URLs,
	// endedCallback is called when the process is done.
	startInstallFromUrls: function(startedCallback, endedCallback) {
		const STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylish/locale/manage.properties")
		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		var o = {value: ""};
		if (!promptService.prompt(window, STRINGS.GetStringFromName("installfromurlsprompttitle"), STRINGS.GetStringFromName("installfromurlsprompt"), o, null, {})) {
			return;
		}
		var urls = o.value.split(/\s+/);
		if (urls.length == 0) {
			return;
		}
		
		if (startedCallback) {
			startedCallback();
		}
		
		// Run through each one, one at a time, keeping track of successes or failures
		var currentIndex = 0;
		var results = {successes: [], failures: []};
		function processResult(result) {
			// We'll consider "cancelled" and "existing" as success, so only "failure" is a failure.
			(result != "failure" ? results.successes : results.failures).push(urls[currentIndex]);
			currentIndex++;
			if (currentIndex < urls.length) {
				stylishCommon.installFromUrl(urls[currentIndex], processResult);
			} else {
				stylishCommon.endInstallFromUrls(results, endedCallback);
			}
		}
		stylishCommon.installFromUrl(urls[currentIndex], processResult);
	},
	
	endInstallFromUrls: function(results, endedCallback) {
		if (endedCallback) {
			endedCallback();
		}
		if (results.failures.length > 0) {
			const STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylish/locale/manage.properties")
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
			promptService.alert(window, STRINGS.GetStringFromName("installfromurlsprompttitle"), STRINGS.formatStringFromName("installfromurlserror", [results.failures.join(", ")], 1));
		}
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
		// Assume a local file is a CSS file.
		if (/^file:.*/i.test(url)) {
			callback("css");
			return;
		}
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
		xhr.overrideMimeType("text/css");
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

	installFromString: function(css, uri, callback) {
		uri = stylishFrameUtils.cleanURI(uri);
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		style.mode = style.CALCULATE_META | style.REGISTER_STYLE_ON_CHANGE;
		style.init(uri, uri, uri, null, null, css, false, css, null, null);
		stylishCommon.openInstall({style: style, installCallback: callback});
	},

	/* Open the installation dialog.
	 *   params: a hash containing style and installCallback. installCallback will be fired with one of: installed, existing, cancelled, failure
	 *   win: (optional) a window object to use in case there isn't one on the global scope
	 */
	openInstall: function(params, win) {
		if (!win) {
			win = window;
		}
		var style = params.style;
		// let's check if it's already installed
		var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
		if (service.findByUrl(style.idUrl, 0) != null) {
			if (params.installCallback) {
				params.installCallback("existing");
			}
			return;
		}

		if (!stylishCommon.isXULAvailable) {
			var installStrings = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylish/locale/install.properties");
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
			var promptTitle = typeof stylishStrings == "undefined" ? "Install user style" : stylishStrings.title;
			var result;
			if (style.name) {
				var installPrompt = installStrings.formatStringFromName("installintro", [style.name], 1);
				// title is read from entity in overlay-mobile.xul, but not available in manage.html (which is not localized anyway!)
				result = promptService.confirm(window, promptTitle, installPrompt);
			} else {
				var installPrompt = "Give the style from '" + style.idUrl + "' a name.";
				var name = {value: ""};
				result = promptService.prompt(window, promptTitle, installPrompt, name, null, {});
				if (result) {
					style.name = name.value;
				}
			}
			if (result) {
				style.enabled = true;
				style.save();
				if (params.installPingURL) {
					var req = new XMLHttpRequest();
					req.open("GET", params.installPingURL, true);
					stylishCommon.fixXHR(req);
					req.send(null);
				}
				if (params.installCallback) {
					params.installCallback("installed");
				}
			} else {
				if (params.installCallback) {
					params.installCallback("cancelled");
				}
			}
			return;
		}
		
		function fillName(prefix) {
			params.windowType = stylishCommon.getWindowName(prefix, params.triggeringDocument ? stylishFrameUtils.cleanURI(params.triggeringDocument.location.href) : null);
		}
		if (Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getBoolPref("extensions.stylish.editOnInstall")) {
			fillName("stylishEdit");
			stylishCommon.openEdit(params.windowType, params, win);
		} else {
			fillName("stylishInstall");
			if (!stylishCommon.focusWindow(params.windowType)) {
				win.openDialog("chrome://stylish/content/install.xul", params.windowType, "chrome,resizable,dialog=no,centerscreen,resizable", params);
			}
		}
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
		style.init(null, null, null, null, null, code, false, null, null, null);
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

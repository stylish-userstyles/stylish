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

	openInstall: function(params) {
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

var style, strings, nameElement;
var installPingURL = null;
var installCallback = null;
var saved = false;

function init() {
	style = window.arguments[0].style;
	installCallback = window.arguments[0].installCallback;
	installPingURL = window.arguments[0].installPingURL;

	document.documentElement.setAttribute("windowtype", window.arguments[0].windowType);

	nameElement = document.getElementById("name");

	strings = document.getElementById("strings");

	document.documentElement.getButton("extra1").setAttribute("tooltiptext", strings.getString("preview.tooltip"));

	function addText(element, text) {
		element.appendChild(document.createTextNode(text));
	}
	var intro = document.getElementById("install-intro");
	//if we don't have a name, prompt for one
	if (style.name) {
		//presumably someone will write a user style to edit this even if it's provided, so might as well make it work
		nameElement.value = style.name;
		addText(intro, strings.getFormattedString("installintro", [style.name]));
	} else {
		document.getElementById("name-container").style.display = "";
		addText(intro, strings.getString("installintrononame"));
	}
	var types = style.getTypes({});
	if (types.indexOf("app") > -1) {
		addText(intro, " " + strings.getFormattedString("installapp", [stylishCommon.getAppName(), stylishCommon.getAppName()]));
	} else if (types.indexOf("global") > -1) {
		addText(intro, " " + strings.getString("installglobal"));
	} else if (types.indexOf("site") > -1) {
		addText(intro, " " + strings.getString("installsite"));
		var appliesTo = document.getElementById("applies-to");
		style.getPrettyAppliesTo({}).forEach(function(text) {
			var li = document.createElementNS("http://www.w3.org/1999/xhtml", "li");
			addText(li, text);
			appliesTo.appendChild(li);
		});
		appliesTo.style.display = "";
	} else {
		addText(intro, " " + strings.getFormattedString("installnotype", [stylishCommon.getAppName()]));
	}
	window.sizeToContent();

	if (!Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getBoolPref("extensions.stylish.promptOnInstall")) {
		installPingURL = null;
		save(true);
	}
}

function switchToEdit() {
	Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).setBoolPref("extensions.stylish.editOnInstall", true);
	stylishCommon.openEdit(stylishCommon.getWindowName("stylishEdit", style.idUrl), {style: style, installPingURL: installPingURL, installCallback: installCallback});
	window.close();
}

function save(andClose) {
	if (!nameElement.value) {
		alert(strings.getString("missingname"));
		return false;
	}
	style.name = nameElement.value;
	style.enabled = true;
	style.save();
	if (installPingURL) {
		var req = new XMLHttpRequest();
		req.open("GET", installPingURL, true);
		stylishCommon.fixXHR(req);
		req.send(null);
	}
	saved = true;
	
	// do it this way otherwise the ping doesn't work
	if (andClose) {
		setTimeout(window.close, 500);
	}
	return false;
}

function preview() {
	style.setPreview(true);
}

function callCallback() {
	if (installCallback) {
		installCallback(saved ? "installed" : "cancelled");
	}
}

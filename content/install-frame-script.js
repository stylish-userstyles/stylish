Components.utils.import("chrome://stylish/content/frame-utils.js", this);

function isAllowedToInstall(doc) {
	// main doc only
	if (doc.nodeName != "#document" || doc.defaultView.frameElement) {
		return false;
	}
	//this can throw for some reason
	try {
		var domain = doc.domain;
	} catch (ex) {
		return false;
	}
	if (!domain) {
		return false;
	}
	if (doc.defaultView.location.href == "about:blank") {
		return false;
	}
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
	prefs = prefs.getBranch("extensions.stylish.install.");
	var allowedDomains = prefs.getCharPref("allowedDomains").split(" ");
	if (allowedDomains.indexOf(domain) > -1) {
		return true;
	}
	//maybe this is a subdomain 
	for (var i = 0; i < allowedDomains.length; i++) {
		var subdomain = "." + allowedDomains[i];

		var subdomainIndex = domain.lastIndexOf(subdomain);
		if (subdomainIndex > -1 && subdomainIndex == domain.length - subdomain.length) {
			return true;
		}
	}
	return false;
}

addEventListener("DOMContentLoaded", function(event) {
	if (isAllowedToInstall(event.originalTarget)) {
		stylishFrameUtils.getResourcesFromMetas(content.document, [{name: "stylish-md5-url", download: true}, {name: "stylish-id-url"}], function(results) {
			sendAsyncMessage("stylish:get-style-install-status", {idUrl: results["stylish-id-url"], md5:results["stylish-md5-url"]});
		});
	}
});

addMessageListener("stylish:style-can-be-installed", function(message) {
	dispatchEvent("styleCanBeInstalled");
	content.document.addEventListener("stylishInstall", installFromSite);
});

function installFromSite(event) {
	stylishFrameUtils.gatherStyleInfo(content.document, function(results) {
		if (results) {
			sendAsyncMessage("stylish:install-style", results);
		}
	});
}

addMessageListener("stylish:style-installed", function(message) {
	dispatchEvent("styleInstalled");
});

addMessageListener("stylish:style-already-installed", function(message) {
	dispatchEvent("styleAlreadyInstalled");
	// listen to this regardless, the page may decide to allow updates anyway (e.g. for styles with settings)
	content.document.addEventListener("stylishUpdate", updateFromSite);
});

addMessageListener("stylish:style-can-be-updated", function(message) {
	dispatchEvent("styleCanBeUpdated");
	content.document.addEventListener("stylishUpdate", updateFromSite);
});

function updateFromSite(event) {
	var doc = event.originalTarget;
	if (isAllowedToInstall(doc)) {
		stylishFrameUtils.getResourcesFromMetas(doc, [{name: "stylish-md5-url", download: true}, {name: "stylish-update-url"}, {name: "stylish-id-url"}, {name: "stylish-code", download: true}], function(results) {
			// we want both the url and the content of the md5
			var md5Url = stylishFrameUtils.getMeta(doc, "stylish-md5-url");
			sendAsyncMessage("stylish:update-style", {idUrl: results["stylish-id-url"], md5:results["stylish-md5-url"], md5Url: md5Url, updateUrl: results["stylish-update-url"], code: results["stylish-code"]});
		});
	}
}

addMessageListener("stylish:style-updated", function(message) {
	dispatchEvent("styleInstalled");
});

function dispatchEvent(type, data) {
	if (typeof data == "undefined") {
		data = null;
	}
	var stylishEvent = new content.CustomEvent(type, {detail: data});
	content.document.dispatchEvent(stylishEvent);
}

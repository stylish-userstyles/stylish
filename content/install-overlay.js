// Overlay for installing styles
var stylishInstallOverlay = {
	service: Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle),

	init: function() {
		stylishInstallOverlay.STRINGS = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://stylish/locale/overlay.properties");

		//page load listener
		var appcontent = document.getElementById("appcontent"); // browser
		if (!appcontent) {
			appcontent = document.getElementById("frame_main_pane"); // songbird
		}
		if (!appcontent) {
			appcontent = document.getElementById("browsers"); // fennec
		}
		if (appcontent) {
			appcontent.addEventListener("DOMContentLoaded", stylishInstallOverlay.onPageLoad, true);
		}
	},

	isAllowedToInstall: function(doc) {
		//this can throw for some reason
		try {
			var domain = doc.domain;
		} catch (ex) {
			return false;
		}
		if (!domain) {
			return false;
		}
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
		prefs = prefs.getBranch("extensions.stylish.install.");
		var allowedDomains = prefs.getCharPref("allowedDomains").split(" ");
		if (allowedDomains.indexOf(doc.domain) > -1) {
			return true;
		}
		//maybe this is a subdomain 
		for (var i = 0; i < allowedDomains.length; i++) {
			var subdomain = "." + allowedDomains[i];

			var subdomainIndex = doc.domain.lastIndexOf(subdomain);
			if (subdomainIndex > -1 && subdomainIndex == doc.domain.length - subdomain.length) {
				return true;
			}
		}
		return false;
	},

	getCodeFromPage: function(doc) {
		//workaround for bug 194231 
		var codeTextNodes = doc.getElementById("stylish-code").childNodes;
		var code = "";
		for (var i = 0; i < codeTextNodes.length; i++) {
			code += codeTextNodes[i].nodeValue;
		}
		return code;
	},

	checkUpdateEvent: function(doc, style) {
		var code = stylishInstallOverlay.getCodeFromPage(doc);
		if (!stylishCommon.cssAreEqual((style.originalCode || style.code), code)) {
			stylishCommon.dispatchEvent(doc, "styleCanBeUpdated");
			doc.addEventListener("stylishUpdate", stylishInstallOverlay.updateFromSite, false);
		} else {
			stylishCommon.dispatchEvent(doc, "styleAlreadyInstalled");
		}
	},

	getIdUrl: function(doc) {
		var idUrlElement = doc.querySelector("link[rel='stylish-id-url']");
		return idUrlElement ? idUrlElement.href : stylishCommon.cleanURI(doc.location.href);
	},

	onPageLoad: function(event) {
		if (event.originalTarget.nodeName == "#document" && stylishInstallOverlay.isAllowedToInstall(event.originalTarget)) {
			var doc = event.originalTarget;

			//style installed status
			var style = stylishInstallOverlay.service.findByUrl(stylishInstallOverlay.getIdUrl(doc), 0);
			if (style) {
				//if the code isn't available, ask for it and wait
				var code = stylishInstallOverlay.getCodeFromPage(doc);
				if (code) {
					stylishInstallOverlay.checkUpdateEvent(doc, style);
				} else {
					doc.addEventListener("stylishCodeLoaded", function(){stylishInstallOverlay.checkUpdateEvent(doc, style)}, false);
					stylishCommon.dispatchEvent(doc, "styleLoadCode");
				}
			} else {
				stylishCommon.dispatchEvent(doc, "styleCanBeInstalled");
				doc.addEventListener("stylishInstall", stylishInstallOverlay.installFromSite, false);
			}
		}
	},

	installFromSite: function(event) {
		stylishCommon.installFromSite(event.target, function(result) {
			if (result == "installed") {
				stylishCommon.dispatchEvent(event.target, "styleInstalled");
			}
		});
	},

	updateFromSite: function(event) {
		var doc = event.target;
		style = stylishInstallOverlay.service.findByUrl(stylishInstallOverlay.getIdUrl(doc), stylishInstallOverlay.service.REGISTER_STYLE_ON_CHANGE + stylishInstallOverlay.service.CALCULATE_META);
		if (!style) {
			return;
		}
		var links = doc.getElementsByTagName("link");
		var code;
		for (i in links) {
			switch (links[i].rel) {
				case "stylish-code":
					var id = links[i].getAttribute("href").replace("#", "");
					var element = doc.getElementById(id);
					if (element) {
						code = element.textContent;
					}
					break;
			}
		}
		if (!code) {
			return;
		}
		var prompt = stylishInstallOverlay.STRINGS.formatStringFromName("updatestyle", [style.name], 1);
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		if (prompts.confirmEx(window, stylishInstallOverlay.STRINGS.formatStringFromName("updatestyletitle", [], 0), prompt, prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING + prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL, stylishInstallOverlay.STRINGS.formatStringFromName("updatestyleok", [], 0), null, null, null, {}) == 0) {
			style.code = code;
			//we're now in sync with the remote style
			style.originalCode = code;
			style.save();
			stylishCommon.dispatchEvent(doc, "styleInstalled");
		}
	},

	installFromFile: function(event) {
		stylishCommon.installFromFile(content.document);
	}

};

addEventListener("load", stylishInstallOverlay.init, false);
addEventListener("unload", stylishInstallOverlay.destroy, false);


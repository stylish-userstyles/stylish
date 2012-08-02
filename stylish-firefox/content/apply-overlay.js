// This is used with electrolysis as the registering within the XPCOM component does not apply to content.
var stylishApplyOverlay = {

	init: function() {
		messageManager.loadFrameScript("chrome://stylish/content/apply-content.js", true);
	}
/*
	sss: Components.classes["@mozilla.org/content/style-sheet-service;1"].getService(Components.interfaces.nsIStyleSheetService),

	init: function() {
		messageManager.addMessageListener("stylishRegister", stylishApplyOverlay.register);
		messageManager.addMessageListener("stylishUnregister", stylishApplyOverlay.unregister);
	},

	register: function(json) {
		stylishApplyOverlay.sss.loadAndRegisterSheet(json.code, stylishApplyOverlay.sss.AGENT_SHEET);
	},

	unregister: function(json) {
		if (stylishApplyOverlay.sss.sheetRegistered(unregisterUrl, this.sss.AGENT_SHEET))
			stylishApplyOverlay.sss.unregisterSheet(unregisterUrl, this.sss.AGENT_SHEET);
	}
*/
}

addEventListener("load", stylishApplyOverlay.init, false);
//addEventListener("unload", stylishApplyOverlay.destroy, false);


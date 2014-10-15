const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function AboutStylishEdit() { }
AboutStylishEdit.prototype = {
	classDescription: "about:stylish-edit",
	contractID: "@mozilla.org/network/protocol/about;1?what=stylish-edit",
	classID: Components.ID("{3d4ef6d0-548b-11e4-916c-0800200c9a66}"),
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIAboutModule]),

	getURIFlags: function(aURI) {
		return Ci.nsIAboutModule.ALLOW_SCRIPT;
	},

	newChannel: function(aURI) {
		let ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		let channel = ios.newChannel("chrome://stylish/content/edit.xul", null, null);
		channel.originalURI = aURI;
		return channel;
	}
};
const NSGetFactory = XPCOMUtils.generateNSGetFactory([AboutStylishEdit]);

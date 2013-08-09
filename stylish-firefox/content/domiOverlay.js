var stylishDomi = {

	init: function() {
		document.getElementById("ppDOMContext").addEventListener("popupshowing", stylishDomi.nodePopupShowing, false);
	},

	nodePopupShowing: function() {
		document.getElementById("copy-selector").disabled = !(viewer.selectedNode instanceof Element);
	},

	showSelectors: function(event) {
		var selectors = stylishCommon.generateSelectors(viewer.selectedNode);
		var popup = event.target;
		selectors.forEach(function(selector) {
			stylishDomi.addSelectorMenuItem(popup, selector);
		});
	},

	addSelectorMenuItem: function(popup, selector) {
		var menuitem = document.createElementNS(stylishCommon.XULNS, "menuitem");
		menuitem.setAttribute("label", selector);
		menuitem.addEventListener("command", function(event) { stylishDomi.copySelectorToClipboard(event) }, false);
		popup.appendChild(menuitem);
	},

	copySelectorToClipboard: function(event) {
		Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper).copyString(event.target.getAttribute("label"));
	}
};

window.addEventListener("load", stylishDomi.init, false);

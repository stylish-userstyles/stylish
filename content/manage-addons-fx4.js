var stylishManageAddonsFx4 = {

	getSortButtons: function() {
		return document.getElementById('userstyle-sorting').getElementsByTagName('button');
	},

	changeSort: function(event) {
		var button = event.target;

		// remove checkState from other buttons
		var buttons = stylishManageAddonsFx4.getSortButtons();
		Array.filter(buttons, function(b) { return b != button; }).forEach(function(b) { b.removeAttribute("checkState");b.removeAttribute("checked");});

		button.setAttribute('checkState', button.getAttribute('checkState') == "2" ? "1" : "2");
		button.setAttribute("checked", "true");

		stylishManageAddonsFx4.applySort();
	},

	applySort: function() {
		var list = document.getElementById('addon-list');
		var buttons = stylishManageAddonsFx4.getSortButtons();
		var checkedButton = Array.filter(buttons, function(b) { return b.hasAttribute('checkState'); })[0];
		if (checkedButton == null) {
			checkedButton = buttons[0];
		}

		var ascending = checkedButton.getAttribute('checkState') != "1";
		var sortBy = checkedButton.getAttribute('sortBy').split(',');

		var items = Array.slice(list.childNodes, 0);
		sortElements(items, sortBy, ascending);
		while (list.hasChildNodes()) {
			list.removeChild(list.lastChild);
		}
		var frag = document.createDocumentFragment();
		items.forEach(function(el) {
			frag.appendChild(el);
		});
		list.appendChild(frag);
	},
	
	startInstallFromUrls: function(button) {
		const STRINGS = document.getElementById("stylishStrings");
		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		var o = {}
		if (!promptService.prompt(window, STRINGS.getString("installfromurlsprompttitle"), STRINGS.getString("installfromurlsprompt"), o, null, {})) {
			return;
		}
		var urls = o.value.split(/\s+/);
		if (urls.length == 0) {
			return;
		}
		
		button.setAttribute("image", "chrome://browser/skin/tabbrowser/connecting.png");
		button.setAttribute("disabled", "true");
		
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
				stylishManageAddonsFx4.endInstallFromUrls(results, button);
			}
		}
		stylishCommon.installFromUrl(urls[currentIndex], processResult);
	},
	
	endInstallFromUrls: function(results, button) {
		button.setAttribute("image", "");
		button.setAttribute("disabled", "");
		if (results.failures.length > 0) {
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
			const STRINGS = document.getElementById("stylishStrings");
			promptService.alert(window, STRINGS.getString("installfromurlsprompttitle"), STRINGS.getFormattedString("installfromurlserror", [results.failures.join(", ")]));
		}
	}
	
}

// add some more properties so we can sort on them
stylishManageAddonsFx4._createItem = createItem,
createItem = function(addon, b, c) {
	var item = stylishManageAddonsFx4._createItem(addon, b, c);
	if (addon.type == "userstyle") {
		item.setAttribute("styleTypes", addon.styleTypes);
	}
	return item;
}

window.addEventListener('ViewChanged', function(e) {
	if (e.target.getAttribute("type") == "userstyle") {
		stylishManageAddonsFx4.applySort();
	}
}, false);
window.addEventListener("load", function(e) {
	if (document.getElementById("list-view").getAttribute("type") == "userstyle") {
		stylishManageAddonsFx4.applySort();
	}
}, false);


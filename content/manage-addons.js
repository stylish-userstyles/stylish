var stylishManageAddonsFx4 = {

	getSortButtons: function() {
		return document.getElementById('userstyle-sorting').getElementsByTagName('button');
	},

	getActiveSort: function() {
		var buttons = stylishManageAddonsFx4.getSortButtons();
		var checkedButton = Array.filter(buttons, function(b) { return b.hasAttribute('checkState'); })[0];
		if (checkedButton == null) {
			checkedButton = buttons[0];
		}
		var ascending = checkedButton.getAttribute('checkState') != "1";
		var sortBy = checkedButton.getAttribute('sortBy').split(',');
		return [sortBy, ascending];
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
		// this stuff doesn't matter, we're overriding sortElements below
		sortList(list, "name", true);
	},

	startInstallFromUrls: function(button) {
		var startedCallback = function() {
			button.setAttribute("image", "chrome://browser/skin/tabbrowser/connecting.png");
			button.setAttribute("disabled", "true");
		}
		var endedCallback = function() {
			button.setAttribute("image", "");
			button.setAttribute("disabled", "");
		}
		stylishCommon.startInstallFromUrls(startedCallback, endedCallback);
	},

	openAdd: function() {
		// get the chrome window so we can open in tab if necessary
		var win = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].getService(Components.interfaces.nsIWindowWatcher).activeWindow;
		stylishCommon.addCode('', win);
	},

	reportStyle: function(id) {
		var style = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle).find(id, 0);
		if (!style || !style.idUrl) {
			return;
		}
		var http = new XMLHttpRequest();
		http.open("POST", "https://userstyles.org/report", true);
		var params = "idUrl=" + encodeURIComponent(style.idUrl);
		http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
		http.setRequestHeader("Content-length", params.length);
		http.setRequestHeader("Connection", "close");
		http.send(params);
	}
}

// add some more properties so we can sort on them
stylishManageAddonsFx4._createItem = createItem,
createItem = function(addon, b, c) {
	var item = stylishManageAddonsFx4._createItem(addon, b, c);
	if (addon.type == "userstyle") {
		item.setAttribute("styleTypes", addon.styleTypes);
		item.setAttribute("reportable", addon.style.idUrl == null ? false : (addon.style.idUrl.indexOf("http://userstyles.org/") == 0));
	}
	return item;
}

// override sortElements so that we can use a different sort on load
stylishManageAddonsFx4._sortElements = sortElements;
sortElements = function(aList, aSortBy, aAscending) {
	if (aList.length == 0 || aList[0].getAttribute("type") != "userstyle") {
		stylishManageAddonsFx4._sortElements(aList, aSortBy, aAscending);
		return;
	}
	var sort = stylishManageAddonsFx4.getActiveSort();
	stylishManageAddonsFx4._sortElements(aList, sort[0], sort[1]);
}

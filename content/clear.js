var prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch2);
if (!prefService.getBoolPref("extensions.stylish.promptOnClear") || confirm("Are you sure you want to delete all Stylish styles?")) {
	var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
	service.list(service.REGISTER_STYLE_ON_CHANGE, {}).forEach(function(style) {
		style.delete();
	});
}

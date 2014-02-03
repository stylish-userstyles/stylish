Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
var Style = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

//Test styles getting saved
function testStyleSave() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	assert("Style is null", style);
	const url = "http://example.com";
	const updateUrl = "http://example.com/update";
	const md5Url = "http://example.com/md5";
	const name = "Example style";
	const code = "#example { color: red;}";
	style.init(url, url, updateUrl, md5Url, name, code, false, null, null, null, null);
	checkValues(style, url, updateUrl, md5Url, name, code);
	style.save();
	assert("Style didn't get an ID", style.id != null && style.id != 0);
	var id = style.id;
	style = Style.find(id, 0);
	assert("Style saved but not loaded", style);
	checkValues(style, url, updateUrl, md5Url, name, code);
	const newName = "Example style @2";
	style.name = newName;
	style.save();
	style = Style.find(id, 0);
	assert("Style not updated", style.name == newName);	
	style.delete();
	style = Style.find(id, 0);
	assert("Style not deleted", style == null);
};

//Test styles getting applied
function testStyleApplied() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test", "button { text-decoration: underline !important;}", true, null, null, null);
	assert("Style was not enabled", style.enabled);
	assert("Style was not applied", getButtonStyle().textDecoration == "underline");
	style.enabled = false;
	delay(100);
	assert("Style was not unapplied", getButtonStyle().textDecoration == "none");
	style.enabled = true;
	delay(100);
	assert("Style was not applied the second time", getButtonStyle().textDecoration == "underline");
	style.code = "button { font-style: italic !important;}"
	delay(100);
	assert("Style was not unapplied on change", getButtonStyle().textDecoration == "none");
	assert("Style was not appled on change", getButtonStyle().fontStyle == "italic");
	style.enabled = false;
	delay(100);
	assert("Style was not unapplied the second time", getButtonStyle().fontStyle == "normal");
}

//Tests that deleted styles get unapplied
function testDeleteAndUnapply() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test", "button { text-decoration: underline !important;}", true, null, null, null);
	style.save();
	style = Style.find(style.id, Style.REGISTER_STYLE_ON_CHANGE);
	style.delete();
	assert("Deleted style not removed", getButtonStyle().textDecoration != "underline");	
}

//Test appliesToUrl on url rules
function testUrlMatch() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test", "@-moz-document url('http://google.com') { * {color: blue}}", false, null, null, null);
	function v() {
		assert("Style not marked as applied.", style.appliesToUrl("http://google.com"));
		assert("Style incorrectly marked as applied.", !style.appliesToUrl("http://yahoo.com"));
		assert("Style incorrectly marked as applied.", !style.appliesToUrl("http://google.com/foo"));
	}
	v();
	style.save();
	try {
		style = Style.find(style.id, 0);
		v();
	} finally {
		style.delete();
	}
}

//Test appliesToUrl on url prefix rules
function testUrlPrefixMatch() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test", "@-moz-document url-prefix('http://google.com') { * {color: blue}}", false, null, null, null);
	function v() {
		assert("Style not marked as applied.", style.appliesToUrl("http://google.com"));
		assert("Style not marked as applied.", style.appliesToUrl("http://google.com/foo"));
		assert("Style incorrectly marked as applied.", !style.appliesToUrl("http://yahoo.com"));
	}
	v();
	style.save();
	try {
		style = Style.find(style.id, 0);
		v();
	} finally {
		style.delete();
	}
}

//Test appliesToUrl on domain rules
function testDomainMatch() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test", "@-moz-document domain('google.com') { * {color: blue}}", false, null, null, null);
	function v() {
		assert("Style not marked as applied 1.", style.appliesToUrl("http://google.com"));
		assert("Style not marked as applied 2.", style.appliesToUrl("http://google.com/foo"));
		assert("Style not marked as applied 3.", style.appliesToUrl("http://www.google.com/foo"));
		assert("Style not marked as applied 4.", style.appliesToUrl("http://foo.www.google.com/foo"));
		assert("Style incorrectly marked as applied 1.", !style.appliesToUrl("http://yahoo.com"));
		assert("Style incorrectly marked as applied 2.", !style.appliesToUrl("http://google.com.br"));
		assert("Style incorrectly marked as applied 3.", !style.appliesToUrl("http://notgoogle.com"));
	}
	v();
	style.save();
	try {
		style = Style.find(style.id, 0);
		v();
	} finally {
		style.delete();
	}
}

//Load a style then update the code
function testLoadAndUpdateCode() {
	try {
		//first make the style
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		var code = "* {font-style: italic;}";
		style.init(null, null, null, null, "Unit test - load and update code", code, true, null, null, null);
		style.save();
		//now load it
		style = Style.find(style.id, Style.REGISTER_STYLE_ON_CHANGE);
		//update it
		style.code = "* { text-decoration: underline}";
		style.save();
		assert("Old code not removed", getButtonStyle().fontStyle != "italic");	
		assert("New code not applied", getButtonStyle().textDecoration == "underline");
	} finally {
		style.delete();
	}
}

//Load a style then update the name (the name is part of the data url)
function testLoadAndUpdateName() {
	try {
		//first make the style
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		var code = "* {font-style: italic;}";
		style.init(null, null, null, null, "Unit test - load and update name", code, true, null, null, null);
		style.save();
		//now load it
		style = Style.find(style.id, Style.REGISTER_STYLE_ON_CHANGE);
		//update it
		style.name = "Unit test - load and update name - new name";
		style.save();
	} finally {
		style.delete();
	}
	//once deleted it should no longer be applied
	assert("Old code not removed", getButtonStyle().fontStyle != "italic");	
}


//Test the preview function on an enabled style
function testPreviewEnabled() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		var code = "* {font-style: italic;}";
		style.init(null, null, null, null, "Unit test - preview", code, true, null, null, null);
		assert("Style not initially applied", getButtonStyle().fontStyle == "italic");
		style.setPreview(true);
		assert("Style no longer applied after preview turned on", getButtonStyle().fontStyle == "italic");
		style.code = "* { text-decoration: underline}";
		assert("Saved style not unapplied", getButtonStyle().fontStyle != "italic");
		assert("Style preview not applied", getButtonStyle().textDecoration == "underline");
		style.setPreview(false);
		assert("Saved style reapplied", getButtonStyle().fontStyle != "italic");
		assert("Style preview unapplied", getButtonStyle().textDecoration == "underline");
	} finally {
		style.enabled = false;
	}
}

//Test the preview function on a disabled style
function testPreviewDisabled() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		var code = "* {font-style: italic;}";
		style.init(null, null, null, null, "Unit test - preview", code, false, null, null, null);
		assert("Style initially applied", getButtonStyle().fontStyle != "italic");
		style.setPreview(true);
		assert("Style not applied after preview turned on", getButtonStyle().fontStyle == "italic");
		style.code = "* { text-decoration: underline}";
		assert("Saved style not unapplied", getButtonStyle().fontStyle != "italic");
		assert("Style preview not applied", getButtonStyle().textDecoration == "underline");
		style.setPreview(false);
		assert("Previous style not unapplied", getButtonStyle().fontStyle != "italic");
		assert("Style preview not unapplied", getButtonStyle().textDecoration != "underline");
	} finally {
		style.enabled = false;
	}
}

//Test the preview function on a disabled, saved style
function testPreviewDisabledSaved() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		var code = "* {font-style: italic;}";
		style.init(null, null, null, null, "Unit test - preview", code, false, null, null, null);
		assert("Style applied on init", getButtonStyle().fontStyle != "italic");
		style.save();
		assert("Style applied on init", getButtonStyle().fontStyle != "italic");
		style = Style.find(style.id, Style.REGISTER_STYLE_ON_CHANGE);
		style.code = "* { text-decoration: underline}";
		style.setPreview(true);
		assert("Style change not applied", getButtonStyle().textDecoration == "underline");
		assert("Style not applied after preview turned on", getButtonStyle().fontStyle != "italic");
		style.code = "* {font-style: italic;}";
		assert("Style change back did not remove new style", getButtonStyle().color != "blue");
		assert("Style change back add not remove old style", getButtonStyle().fontStyle == "italic");
	} finally {
		style.enabled = false;
		style.delete();
	}
}


//Test various things being blank
function testBlankApply() {
	//enabling a blank style
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.enabled = true;

	//applying code when there is no name
	style.code = "* {font-style: italic;}"
	assert("Style not initially applied", getButtonStyle().fontStyle == "italic");

	//giving an applied style a name
	style.name = "Foo";
	style.enabled = false;
	assert("Style not unapplied", getButtonStyle().fontStyle != "italic");

	//nulling code
	style.enabled = true;
	style.code = null;
	assert("Style not unapplied after null", getButtonStyle().fontStyle != "italic");

	//clean up
	style.enabled = false;
}


//Test arbritrary meta values
function testMeta() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "foo", "* {}", true, null, null, null);
	style.addMeta("foo", "bar");
	style.save();
	try {
		style = Style.find(style.id, 0);
		var vals = style.getMeta("foo", {});
		assert("Meta not applied", vals.length == 1 && vals[0] == "bar");
		vals = style.getMeta("baz", {});
		assert("Wrong meta returned", vals.length == 0);
		style.removeMeta("foo", "wrong value");
		vals = style.getMeta("foo", {});
		assert("Meta mistakenly removed", vals.length == 1 && vals[0] == "bar");	
		style.removeMeta("foo", "bar");	
		vals = style.getMeta("foo", {});
		assert("Meta not removed", vals.length == 0);
		style.addMeta("foo", "sna");
		style.addMeta("wha", "tthe");
		style.save();
		style = Style.find(style.id, 0);
		vals = style.getMeta("foo", {});
		assert("Meta not applied the second time - found " + vals.length, vals.length == 1 && vals[0] == "sna");
		style.removeAllMeta("foo");
		style.save();
		style = Style.find(style.id, 0);
		vals = style.getMeta("foo", {});
		assert("Meta not removed with removeAllMeta", vals.length == 0);
		vals = style.getMeta("wha", {});
		assert("Wrong meta removed with removeAllMeta", vals.length > 0);
	} finally {
		style.delete();
	}
}

function testAppliesSearch() {
	var styles = Style.findForUrl("http://thisisnotarealdomain.com", false, 0, {});
	assert("Style pre-existing", styles.length == 0);
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "foo", "@-moz-document domain('thisisnotarealdomain.com') {}", true, null, null, null);
	style.save();
	var id = style.id;
	try {
		styles = Style.findForUrl("http://thisisnotarealdomain.com", false, 0, {});
		assert("Style not found", styles.length == 1);
		assert("Incorrect style found", styles[0].id == id);
	} finally {
		style.delete();
	}
}

//Test some invalid CSS
var badCSSError = null;
function testBadCSSSetup() {
	var errorListener = {
		QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIConsoleListener, Components.interfaces.nsISupports]),
		observe: function(message) {
			badCSSError = message.QueryInterface(Components.interfaces.nsIConsoleMessage).message;
		}
	}
	Style.checkForErrors("* {foo:bar;}", errorListener);
}
function asyncBadCSSComplete() {
	assert("Didn't find the errors", /foo/.test(badCSSError));
}


function testType() {
	function ensureType(message, type) {
		var currentType = style.getTypes({});
		if (typeof type == "string")
			type = [type];
		assert(message + " - expected '" + type + "' got '" + currentType +"'", arraysEqual(currentType, type));
	}
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test", "* {color: blue}", false, null, null, null);
	ensureType("No namespace no moz-doc", "global");
	style.code = "@namespace url('http://www.w3.org/1999/xhtml');* {color: blue}";
	ensureType("HTML namespace no moz-doc", "global");
	style.code = "@namespace url('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul');* {color: blue}";
	ensureType("XUL namespace no moz-doc", "app");
	style.code = "@namespace url('http://www.w3.org/1999/xhtml');@-moz-document domain(google.com){* {color: blue}}";
	ensureType("HTML namespace and domain rule", "site");
	style.code = "@namespace url('http://www.w3.org/1999/xhtml');@-moz-document url(http://google.com){* {color: blue}}";
	ensureType("HTML namespace and URL rule", "site");
	style.code = "@namespace url('http://www.w3.org/1999/xhtml');@-moz-document url-prefix(http://google.com){* {color: blue}}";
	ensureType("HTML namespace and URL prefix rule", "site");
	style.code = "@-moz-document url-prefix(chrome://stylish){* {color: blue}}";
	ensureType("No namespace and chrome URL prefix rule", "app");
	style.code = "@-moz-document url-prefix(http://google.){* {color: blue}}*{color:blue}";
	ensureType("No namespace, http URL prefix rule, and no -moz-doc rule", "global");
	style.code = "@-moz-document url-prefix(http://){* {color: blue}}";
	ensureType("No namespace, http:// only URL prefix rule", "global");
	style.code = "@-moz-document url-prefix(http:){* {color: blue}}";
	ensureType("No namespace, http: only URL prefix rule isn't global", "global");
	style.code = "@-moz-document url-prefix(http){* {color: blue}}";
	ensureType("No namespace, http only URL prefix rule isn't global", "global");
	style.code = "@-moz-document domain(google.com){* {color: blue}}";
	ensureType("No namespace, domain rule", "site");
}

function testFindByUrl() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		const url = "http://example.com/foo/bar";
		style.init(url, url, null, null, "Unit test", "/**/", false, null, null, null);
		style.save();
		style = Style.findByUrl(url, 0);
		assert("Style not found", style);
	} finally {
		style.delete();
	}
}

function testSaveOriginalCodeNoUpdate() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		const url = "http://example.com/foo/bar";
		style.init(url, url, null, null, "Unit test - save original code no update", "/* original code */", false, null, null, null);
		style.save();
		assert("Style got original code for no reason", style.originalCode == null);
		style.code = "/* new code */";
		style.save();
		assert("Style didn't get new code", style.code == "/* new code */");
		assert("Style got original code though there is no possibility of update", style.originalCode == null);
	} finally {
		style.delete();
	}
}

function testSaveOriginalCodeWithUpdate() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		const url = "http://example.com/foo/bar";
		style.init(url, url, "http://example.com/update", "http://example.com/update", "Unit test - save original code with update", "/* original code */", false, null, null, null);
		style.save();
		assert("Style got original code for no reason", style.originalCode == null);
		style.code = "/* new code */";
		style.save();
		assert("Style didn't get new code", style.code == "/* new code */");
		assert("Style didn't get original code, it was: " + style.originalCode, style.originalCode == "/* original code */");
		style = Style.find(style.id, 0);
		style.code = "/* newer code */";
		assert("Style's original code was updated", style.originalCode == "/* original code */");
	} finally {
		style.delete();
	}
}

function testSaveOriginalCodeInitial() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		const url = "http://example.com/foo/bar";
		style.init(url, url, "http://example.com/update", "http://example.com/update", "Unit test - save original code initial", "/* original code */", false, "/* original code */", null, null);
		style.code = "/* new code */";
		style.save();
		assert("Style didn't get new code", style.code == "/* new code */");
		assert("Style didn't get original code, it was: " + style.originalCode, style.originalCode == "/* original code */");
	} finally {
		style.delete();
	}
}

function testLineBreak() {
	try {
		var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		style.init(null, null, null, null, "Unit test - whitespace", "#test {\nbackground-image: url('data:image/png;base64,\niVBORw0KGgoAAAANSUhEUgAAABEAAAARCAYAAAA7bUf6AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A\n/wD/oL2nkwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAAd0SU1FB9kHGBYWMPyCHp4AAAGVSURBVDjL\ntZM/S5tBHMc/jzkxSynRteASOtSOlg4ZBIlB6htw7dI4dHGza1+CFMzTsRAVFHRSsOQtJLhkESqF\nLl2a8Dw+9+R57rk7h2gS8+TRIvqb7o7vffn+uYMnGOd2Uau5Ngu0sVF17iMRo5tq9VMK4LrfH1Ry\nhySU8lF2xKgVz/cmgsattlpNXNd1UkoqlRWkDFMElcpK6qzVak62c3b2M1PuzosqACbOYXs5Snyc\nTDL/finbdBvWy5sA/Ki72cEuv32N0pBoi9KWOAGlLZG20O5joji8vx1lLImBWIPS8OF0WJyJc0Qq\nJIg8dCBoFA4obs1aczXNr29/nQEySfqX+yr6ZdxaiOKQIPTwZZd35QU8+Q9fdrk8FmNKbizE2qIS\ni1FTNwSSoOfjyy6+7AwIHEDLMZI4sSgzzMH2BLsn2+jODDoQLJbf4MkO5/UAG+bRvVw6k69fPt8J\na7TGRuEQL+hwFXYxMs/ay1XcveFjc/7nWRe35uyrksABLup5/uz/djL/TtboQHB5JNBSYCLBs8w1\nd7/MECNU588AAAAASUVORK5CYII=\n')\n}", false, "null", null, null);
		style.enabled = true;
		delay(100);
		assert("Style with line breaks worked", getButtonStyle().backgroundImage == "none");
		style.code = "#test {background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAARCAYAAAA7bUf6AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAAOxAAADsQBlSsOGwAAAAd0SU1FB9kHGBYWMPyCHp4AAAGVSURBVDjLtZM/S5tBHMc/jzkxSynRteASOtSOlg4ZBIlB6htw7dI4dHGza1+CFMzTsRAVFHRSsOQtJLhkESqFLl2a8Dw+9+R57rk7h2gS8+TRIvqb7o7vffn+uYMnGOd2Uau5Ngu0sVF17iMRo5tq9VMK4LrfH1RyhySU8lF2xKgVz/cmgsattlpNXNd1UkoqlRWkDFMElcpK6qzVak62c3b2M1PuzosqACbOYXs5SnycTDL/finbdBvWy5sA/Ki72cEuv32N0pBoi9KWOAGlLZG20O5joji8vx1lLImBWIPS8OF0WJyJc0QqJIg8dCBoFA4obs1aczXNr29/nQEySfqX+yr6ZdxaiOKQIPTwZZd35QU8+Q9fdrk8FmNKbizE2qISi1FTNwSSoOfjyy6+7AwIHEDLMZI4sSgzzMH2BLsn2+jODDoQLJbf4MkO5/UAG+bRvVw6k69fPt8Ja7TGRuEQL+hwFXYxMs/ay1XcveFjc/7nWRe35uyrksABLup5/uz/djL/TtboQHB5JNBSYCLBs8w1d7/MECNU588AAAAASUVORK5CYII=')}";
		assert("Style with line break stripped didn't work", getButtonStyle().backgroundImage != "none");
	} finally {
		style.enabled = false;
	}
}

var updateMd5NoUpdate = null;
var updateMd5NoUpdateObserver = {
	observe: function(subject, topic, data) {
		if (subject.name == "testUpdateMd5NoUpdate") {
			updateMd5NoUpdate = data;
		}
	}
}
function testUpdateMd5NoUpdate() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, "data:text/plain,2642306a8b25001880ccb55e68456165", "testUpdateMd5NoUpdate", "* {color: blue}", false, null, null, null);
	observerService.addObserver(updateMd5NoUpdateObserver, "stylish-style-update-check-done", false);
	style.checkForUpdates(null);
}
function asyncUpdateMd5NoUpdate() {
	observerService.removeObserver(updateMd5NoUpdateObserver, "stylish-style-update-check-done");
	assert("Expected 'no-update-available', got '" + updateMd5NoUpdate + "'.", updateMd5NoUpdate == "no-update-available");
}


var updateMd5WithUpdate = null;
var updateMd5WithUpdateObserver = {
	observe: function(subject, topic, data) {
		if (subject.name == "testUpdateMd5WithUpdate") {
			updateMd5WithUpdate = data;
		}
	}
}
function testUpdateMd5WithUpdate() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, "data:text/plain,12345678901234567890123456789012", "testUpdateMd5WithUpdate", "* {color: blue}", false, null, null, null);
	observerService.addObserver(updateMd5WithUpdateObserver, "stylish-style-update-check-done", false);
	style.checkForUpdates(null);
}
function asyncUpdateMd5WithUpdate() {
	observerService.removeObserver(updateMd5WithUpdateObserver, "stylish-style-update-check-done");
	assert("Expected 'update-available', got '" + updateMd5WithUpdate + "'.", updateMd5WithUpdate == "update-available");
}


var updateUrlNoUpdate = null;
var updateUrlNoUpdateObserver = {
	observe: function(subject, topic, data) {
		if (subject.name == "testUpdateUrlNoUpdate") {
			updateUrlNoUpdate = data;
		}
	}
}
function testUpdateUrlNoUpdate() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, "data:text/css,* {color: blue}", null, "testUpdateUrlNoUpdate", "* {color: blue}", false, null, null, null);
	observerService.addObserver(updateUrlNoUpdateObserver, "stylish-style-update-check-done", false);
	style.checkForUpdates(null);
}
function asyncUpdateUrlNoUpdate() {
	observerService.removeObserver(updateUrlNoUpdateObserver, "stylish-style-update-check-done");
	assert("Expected 'no-update-available', got '" + updateUrlNoUpdate + "'.", updateUrlNoUpdate == "no-update-available");
}


var updateUrlWithUpdate = null;
var updateUrlWithUpdateObserver = {
	observe: function(subject, topic, data) {
		if (subject.name == "testUpdateUrlWithUpdate") {
			updateUrlWithUpdate = data;
		}
	}
}
function testUpdateUrlWithUpdate() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, "data:text/css,* { color: red}", null, "testUpdateUrlWithUpdate", "* {color: blue}", false, null, null, null);
	observerService.addObserver(updateUrlWithUpdateObserver, "stylish-style-update-check-done", false);
	style.checkForUpdates(null);
}
function asyncUpdateUrlWithUpdate() {
	observerService.removeObserver(updateUrlWithUpdateObserver, "stylish-style-update-check-done");
	assert("Expected 'update-available', got '" + updateUrlWithUpdate + "'.", updateUrlWithUpdate == "update-available");
}


var updateNotAvailable = null;
var updateNotAvailableObserver = {
	observe: function(subject, topic, data) {
		if (subject.name == "testUpdateNotAvailable") {
			updateNotAvailable = data;
		}
	}
}
function testUpdateNotAvailable() {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "testUpdateNotAvailable", "* {color: blue}", false, null, null, null);
	observerService.addObserver(updateNotAvailableObserver, "stylish-style-update-check-done", false);
	style.checkForUpdates(null);
}
function asyncUpdateNotAvailable() {
	observerService.removeObserver(updateNotAvailableObserver, "stylish-style-update-check-done");
	assert("Expected 'no-update-possible', got '" + updateNotAvailable + "'.", updateNotAvailable == "no-update-possible");
}


var runUpdateAvailable = null;
var runUpdateAvailableStyle = null;
var runUpdateAvailableObserver = {
	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver, Components.interfaces.nsISupports]),
	observe: function(subject, topic, data) {
		if (runUpdateAvailableStyle == subject) {
			runUpdateAvailable = data;
		}
	}
}
function testRunUpdateAvailable() {
	runUpdateAvailableStyle = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	runUpdateAvailableStyle.init(null, null, "data:text/css,* {color: red}", null, "Unit test testRunUpdateAvailable", "* {color: blue}", false, null, null, null);
	observerService.addObserver(runUpdateAvailableObserver, "stylish-style-update-done", false);
	runUpdateAvailableStyle.applyUpdate(null);
}
function asyncRunUpdateAvailable() {
	observerService.removeObserver(runUpdateAvailableObserver, "stylish-style-update-done");
	assert("Expected 'update-success', got '" + runUpdateAvailable + "'.", runUpdateAvailable == "update-success");
	assert("Style code not updated", runUpdateAvailableStyle.code == "* {color: red}");
	runUpdateAvailableStyle.delete();
}


var runUpdateNotAvailable = null;
var runUpdateNotAvailableStyle = null;
var runUpdateNotAvailableObserver = {
	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver, Components.interfaces.nsISupports]),
	observe: function(subject, topic, data) {
		if (runUpdateNotAvailableStyle == subject) {
			runUpdateNotAvailable = data;
		}
	}
};
function testRunUpdateNotAvailable() {
	runUpdateNotAvailableStyle = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	runUpdateNotAvailableStyle.init(null, null, null, null, "Unit test testRunUpdateNotAvailable", "* {color: blue}", false, null, null, null);
	observerService.addObserver(runUpdateNotAvailableObserver, "stylish-style-update-done", false);
	runUpdateNotAvailableStyle.applyUpdate(null);
}
function asyncRunUpdateNotAvailable() {
	observerService.removeObserver(runUpdateNotAvailableObserver, "stylish-style-update-done");
	assert("Expected 'no-update-possible', got '" + runUpdateNotAvailable + "'.", runUpdateNotAvailable == "no-update-possible");
	assert("Style code not updated", runUpdateNotAvailableStyle.code == "* {color: blue}");
}


function getPrettyAppliesToItemsFromCode(code) {
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	assert("Style is null", style);
	const url = "http://example.com";
	const updateUrl = "http://example.com/update";
	const md5Url = "http://example.com/md5";
	const name = "Example style";
	style.init(url, url, updateUrl, md5Url, name, code, false, null, null, null);
	return style.getPrettyAppliesTo({});
}

function testUrl() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document url('http://www.example.com/foo') {* { color: blue } }");
	assert(meta.length + " metas found.", meta.length == 1);
	assertEqual("http://www.example.com/foo", meta[0]);
}

function testUrlPrefix() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document url-prefix('http://www.example.com/foo') {* { color: blue } }");
	assert(meta.length + " metas found.", meta.length == 1);
	assert("http://www.example.com/foo*", meta[0]);
}

function testDomain() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document domain('www.example.com') {* { color: blue } }");
	assert(meta.length + " metas found.", meta.length == 1);
	assert("http://www.example.com/foo", meta[0]);
}

function testRegexpWithBracket() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document regexp('http://userstyles.org/styles/[0-9]{4,5}/edit') { * { color: blue } }");
	assert(meta.length + " metas found.", meta.length == 1);
	assertEqual("http://userstyles.org/styles/[0-9]{4,5}/edit", meta[0]);
}

function testNoOverlap() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document domain('www.example.com'), url('http://www.somethingelse.com/foo') {* { color: blue } }");
	assert(meta.length + " metas found.", meta.length == 2);
}

function testDomainOverridesUrl() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document domain('www.example.com'), url('http://www.example.com/foo') {* { color: blue } }");
	assert(meta.length + " metas found.", meta.length == 1);
	assertEqual("www.example.com", meta[0]);
}

function testDomainOverridesUrlOnSubdomain() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document domain('example.com'), url('http://www.example.com/foo') {* { color: blue } }");
	assert(meta.length + " metas found.", meta.length == 1);
	assertEqual("example.com", meta[0]);
}

function testSubDomainDoesntOverrideUrlOnRootDomain() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document domain('www.example.com'), url('http://example.com/foo') {}");
	assert(meta.length + " metas found.", meta.length == 2);
}

function testDomainOverridesUrlPrefix() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document domain('www.example.com'), url-prefix('http://www.example.com/foo') {}");
	assert(meta.length + " metas found.", meta.length == 1);
	assertEqual("www.example.com", meta[0]);
}

function testDomainOverridesSubdomain() {
	var meta = getPrettyAppliesToItemsFromCode("@-moz-document domain('www.example.com'), domain('example.com') {}");
	assert(meta.length + " metas found.", meta.length == 1);
	assertEqual("example.com", meta[0]);
}

function testRegexpIsNotGlobal() {
	function ensureType(message, type) {
		var currentType = style.getTypes({});
		if (typeof type == "string")
			type = [type];
		assert(message + " - expected '" + type + "' got '" + currentType +"'", arraysEqual(currentType, type));
	}
	var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test - testRegexpIsNotGlobal", '@-moz-document regexp("^https?://((www|gist|help|status).)?github.*") { * { color: blue} }', false, null, null, null);
	ensureType('@-moz-document regexp("^https?://((www|gist|help|status).)?github.*") { * { color: blue} }', "site");
	style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test - testRegexpIsNotGlobal", '@-moz-document regexp("^http(s)?://((www|gist|help|status).)?github.*") { * { color: blue} }', false, null, null, null);
	ensureType('@-moz-document regexp("^http(s)?://((www|gist|help|status).)?github.*") { * { color: blue} }', "site");
	style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
	style.init(null, null, null, null, "Unit test - testRegexpIsNotGlobal", '@-moz-document regexp("^http(s)?://.*") { * { color: blue} }', false, null, null, null);
	ensureType('@-moz-document regexp("^http(s)?://.*") { * { color: blue} }', "global");
}


function checkValues(style, url, updateUrl, md5Url, name, code) {
	assert("URL doesn't match", style.url == url);
	assert("Update URL doesn't match", style.updateUrl == updateUrl);
	assert("MD5 URL doesn't match", style.md5Url == md5Url);
	assert("Name doesn't match", style.name == name);
	assert("Code doesn't match", style.code == code);
	assert("Style became enabled", !style.enabled);
}

function getButtonStyle() {
	return window.getComputedStyle(document.getElementById("test"), "");
}

function delay(ms) {
	var end = (Date.now()) + ms;
	while (end > (Date.now()))
		Math.sin(Math.random());
}

function arraysEqual(a, b) {
	if (a.length != b.length)
		return false;
	return a.every(function(v) {
		return b.indexOf(v) > -1;
	});
}

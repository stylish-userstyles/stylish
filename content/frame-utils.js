var EXPORTED_SYMBOLS = ["stylishFrameUtils"];

/* Functions to be used by both frame and chrome scripts */
var stylishFrameUtils = {
	cleanURI: function(uri) {
		var hash = uri.indexOf("#");
		if (hash > -1) {
			uri = uri.substring(0, hash);
		}
		return uri;
	},

	// Returns the value of the <link> with a "rel" of the passed name.
	getMeta: function(doc, name) {
		var e = doc.querySelector("link[rel='" + name + "']");
		return e ? e.getAttribute("href") : null;
	},

	// Callback passes hash or null
	gatherStyleInfo: function(doc, callback) {
		// we want both the url and the content of the md5
		var md5Url = stylishFrameUtils.getMeta(doc, "stylish-md5-url");
		var resourcesNeeded = [{name: "stylish-code", download: true}, {name: "stylish-description", download: true}, {name: "stylish-install-ping-url"}, {name: "stylish-update-url"}, {name: "stylish-md5-url", download: true}, {name: "stylish-id-url"}];

		stylishFrameUtils.getResourcesFromMetas(doc, resourcesNeeded, function(results) {
			// This is the only required property
			if (results["stylish-code"] == null || results["stylish-code"].length == 0) {
				callback(null);
				return;
			}
			var uri = stylishFrameUtils.cleanURI("documentURI" in doc ? doc.documentURI : doc.location.href);
			results["uri"] = uri;
			if (results["stylish-id-url"] == null) {
				results["stylish-id-url"] = uri
			}
			results["stylish-md5"] = results["stylish-md5-url"];
			results["stylish-md5-url"] = md5Url;

			callback(results);
		});
	},

	// Gets the values of the passed meta names.
	//   doc
	//   resourcesToGet: an array of:
	//     name: meta name to get
	//     download: if true, will download if the value is a remote URL
	//   callback: called with a hash of name to value
	getResourcesFromMetas: function(doc, resourcesToGet, callback) {
		var keyUrls = {};
		var resourcesToDownload = [];
		resourcesToGet.forEach(function(r) {
			var c = stylishFrameUtils.getMeta(doc, r.name);
			if (r.download) {
				resourcesToDownload.push({name: r.name, url: c});
			} else {
				keyUrls[r.name] = c;
			}
		});
		stylishFrameUtils.getResources(doc, resourcesToDownload, function(results) {
			results.forEach(function(r) {
				keyUrls[r.name] = r.value;
			});
			callback(keyUrls);
		});
	},
	
	// Gets the values of the passed URLs.
	//   doc
	//   resources: an array of:
	//     name: name of the resource
	//     url: url of the resource
	//   callback: called with a hash of name to value
	getResources: function(doc, resources, callback) {
		var results = [];
		
		function assembleResults(name, value) {
			results.push({name: name, value: value});
			if (results.length == resources.length) {
				callback(results);
			}
		}
		
		resources.forEach(function(resource) {
			stylishFrameUtils.getResource(doc, resource.name, resource.url, assembleResults);
		});
	},
	
	// Get the value of the passed URL.
	getResource: function(doc, name, url, callback) {
		if (url == null) {
			callback(name, null);
			return;
		}
		if (url.indexOf("#") == 0) {
			callback(name, doc.getElementById(url.substring(1)).textContent);
			return;
		}
		// Use the page's XHR if possible
		var xhr = doc.defaultView ? new doc.defaultView.XMLHttpRequest() : new XMLHttpRequest();
		xhr.onload = function() {
			if (xhr.status >= 400) {
				callback(name, null);
			} else {
				callback(name, xhr.responseText);
			}
		}
		if (url.length > 2000) {
			var parts = url.split("?");
			xhr.open("POST", parts[0], true);
			xhr.setRequestHeader("Content-type","application/x-www-form-urlencoded");
			xhr.send(parts[1]);
		} else {
			xhr.open("GET", url, true);
			xhr.send();
		}
	},

}

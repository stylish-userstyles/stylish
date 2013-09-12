function AssertionFailure(message) {
	this.message = message;
}

function assert() {
	var value, comment;
	if (arguments.length == 1)
		value = arguments[0];
	else {
		comment = arguments[0];
		value = arguments[1];
	}
	if (!value)
		throw new AssertionFailure(comment);
}

function assertEqual() {
	assert("Value is '" + arguments[1] + "', expected '" + arguments[0] + "'", arguments[0] == arguments[1]);
}

var theTests = [];
var theAsyncs = [];
for (var i in window) {
	if (/test.+/.test(i)) {
		theTests.push({name: i, f: window[i]});
	} else if (/async.+/.test(i)) {
		theAsyncs.push({name: i, f: window[i]});
	}
}
theTests.reverse();
theAsyncs.reverse();

var results = [];
function runTest(test) {
	try {
		test.f();
		results.push({test: test.name, result: "pass"});
	} catch (ex) {
		if (ex instanceof AssertionFailure)
			results.push({test: test.name, result: "fail", message: ex.message});
		else {
			Components.utils.reportError(ex);
			results.push({test: test.name, result: "error", message: ex});
		}
	}
}
theTests.forEach(runTest);
alert("doing async!");
theAsyncs.forEach(runTest);

var html = results.map(function(result) {
	var bg;
	switch (result.result) {
		case "pass":
			bg = "#0C0";
			break;
		case "fail":
			bg = "blue";
			break;
		case "error":
			bg = "red";
			break;
	}
	var message = result.test + " " + (result.message || "");
	return "<div style='background-color: " + bg + ";'>" + message + "</div>";
}).join("\n");
window.open("data:text/html;charset=utf-8," + encodeURIComponent(html), "results");

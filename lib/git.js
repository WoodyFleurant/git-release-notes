var debug = require("debug")("release-notes:git");
var parser = require("debug")("release-notes:parser");

exports.log = function (options, callback) {
	var spawn = require("child_process").spawn;
	var commits = options.mergeCommits ? "--merges" : "--no-merges";
	var gitArgs = ["log", "--no-color", commits, "--branches=" + options.branch, "--format=" + formatOptions, options.range];
	debug("Spawning git with args %o", gitArgs);
	var gitLog = spawn("git", gitArgs, {
		cwd : options.cwd,
		stdio : ["ignore", "pipe", process.stderr]
	});

	var allCommits = "";
	gitLog.stdout.on("data", function (data) {
		allCommits += data;
	});

	gitLog.on("exit", function (code) {
		debug("Git command exited with code '%d'", code);
		if (code === 0) {
			allCommits = normalizeNewlines(allCommits).trim();

			if (allCommits) {
				// Build the list of commits from git log
				var commits = processCommits(allCommits, options);
				callback(commits);
			} else {
				callback([]);
			}
		} else {
			// propagate error code
			process.exit(code);
		}
	});
};

var newCommit = "___";
var formatOptions = [
	newCommit, "sha1:%H", "authorName:%an", "authorEmail:%ae", "authorDate:%aD",
	"committerName:%cn", "committerEmail:%ce", "committerDate:%cD",
	"title:%s", "%w(80,1,1)%b"
].join("%n");

function processCommits (commitMessages, options) {
	// This return an object with the same properties described above
	var stream = commitMessages.split("\n");
	var commits = [];
	var workingCommit;
	parser("Iterating on %d lines", stream.length);
	stream.forEach(function (rawLine) {
		processCommit(commits, workingCommit, rawLine, options);
	});
	return commits;
}

function processCommit(commits, workingCommit, rawLine, options) {
	parser("Raw line\n\t%s", rawLine);
	var line = parseLine(rawLine);
	parser("Parsed line %o", line);
	var includeCommit = line.type === "new" && commitMatches(rawLine, options);
	if (includeCommit) {
		workingCommit = {
			messageLines : []
		};
		commits.push(workingCommit);
	} else if (line.type === "message") {
		workingCommit.messageLines.push(line.message);
	} else if (line.type === "title") {
		var title = parseTitle(line.message, options);
		parser("Parsed title %o", title);
		for (var prop in title) {
			workingCommit[prop] = title[prop];
		}
		if (!workingCommit.title) {
			// The parser doesn't return a title
			workingCommit.title = line.message;
		}
	} else {
		workingCommit[line.type] = line.message;
	}
}

function parseLine (line) {
	if (line === newCommit) {
		return {
			type : "new"
		};
	}

	var match = line.match(/^([a-zA-Z]+1?)\s?:\s?(.*)$/i);

	if (match) {
		return {
			type : match[1],
			message : match[2].trim()
		};
	} else {
		return {
			type : "message",
			message : line.substring(1) // padding
		};
	}
}

function commitMatches(rawLine, options) {
	var regex = options.grep;
	if(regex){
		var match = rawLine.match(regex);
		if(match){
			parser("including commit");
			return true;
		} else {
			parser("excluding commit");
			return false;
		}
	}
	// No regular expression specified so all are included.
	parser("including all commits");
	return true;
}

function parseTitle (title, options) {
	var expression = options.title;
	var names = options.meaning;
	parser("Parsing title '%s' with regular expression '%s' and meanings %o", title, expression, names);

	var match = title.match(expression);
	if (!match) {
		return {
			title : title
		};
	} else {
		var builtObject = {};
		for (var i = 0; i < names.length; i += 1) {
			var name = names[i];
			var index = i + 1;
			builtObject[name] = match[index];
		}
		return builtObject;
	}
}

function normalizeNewlines(message) {
	return message.replace(/\r\n?|[\n\u2028\u2029]/g, "\n").replace(/^\uFEFF/, '');
}

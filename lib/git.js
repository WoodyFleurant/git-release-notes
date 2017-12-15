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
	var workingCommit = null;
	parser("Iterating on %d lines", stream.length);
	
	for(lineIndex=0; lineIndex < stream.length; lineIndex++){
		parser("Begin for loop - lineIndex %d", lineIndex);
		var rawLine = stream[lineIndex];
		parser("Raw line\n\t%s", rawLine);
		var line = parseLine(rawLine, options);
		parser("Parsed line %o", line);
		
		workingCommit = processLine(line, stream, lineIndex, options);
		if(workingCommit != null){
			commits.push(workingCommit);
		}
	}
	return commits;
}

function processLine(line, stream, lineIndex, options){
	var workingCommit = null;
	
	if (line.type === "new" && includeCommit(lineIndex, stream, options)) {
		parser("New Line!!!");
		workingCommit = {
			messageLines : []
		};
		
		processCommit(workingCommit, stream, lineIndex, options);
		
		parser("My Commit - %o", workingCommit);
		return workingCommit;
	} 
	
	return workingCommit;
}

function processCommit(workingCommit, stream, lineIndex, options){
	var index = lineIndex;
	
	for(streamIndex=index + 1; streamIndex < stream.length; streamIndex++){
		var rawLine = stream[streamIndex];
		var line = parseLine(rawLine, options);
		
		if (line.type === "new") {
			return;
		} 
		else if (line.type === "message") {
			workingCommit.messageLines.push(line.message);
		} 
		else if (line.type === "title") {
			var title = parseTitle(line.message, options);
			parser("Parsed title %o", title);
			for (var prop in title) {
				workingCommit[prop] = title[prop];
			}
		
			if (!workingCommit.title) {
				// The parser doesn't return a title
				workingCommit.title = line.message;
			}
		} 
		else {
			workingCommit[line.type] = line.message;
		}
	}
}

function parseLine (line, options) {
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

function findNextTitle (newCommitIndex, stream, options) {
	//parser("Find Title for index %d", streamIndex);
	var index = newCommitIndex;
	for(lineIndex=index + 1; lineIndex < stream.length; lineIndex++){
		var rawLine = stream[lineIndex];
		//parser("findNextTitle - Raw line\n\t%s", rawLine);
		var parsedObject = parseLine(rawLine, options);
		//parser("findNextTitle - Parsed line %o", parsedObject);
		if (parsedObject && parsedObject.type == 'title') {
			return parsedObject.message;
		}
	}
	return null;
}

function findNextNewLine (streamIndex, stream, options) {
	for(lineIndex=streamIndex + 1; lineIndex < stream.length; lineIndex++){
		var rawLine = stream[lineIndex];
		if (rawLine === newCommit) {
			//parser("findNextNewLine - lineIndex %d", lineIndex);
			var rawLine = stream[lineIndex];
			parser("findNextNewLine - Raw line\n\t%s", rawLine);
			var parsedObject = parseLine(rawLine, options);
			//parser("findNextNewLine - Parsed line %o", parsedObject);
			return lineIndex;
		}
	}
	
	return null;
}

function includeCommit(newCommitIndex, stream, options){
	var expression = options.commitfilter;
	var nextTitle = findNextTitle(newCommitIndex, stream, options);
	if(expression){
		var match = nextTitle.match(expression);
		if(match){
			parser("including commit");
			return true;
		}
	}
	else{
		// No regular expression specified so all are included.
		parser("including commit 2");
		return true;
	}
	parser("excluding commit");
	return false;
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

"use strict";
//var LearnedComparator = require('../src/LearnedComparator');

var positives = [

	{
		expected: "$NAME was beginning to get very tired of sitting"+
				  " by her ${SIBLING} on the bank",
		fact:     "Alice was beginning to get very tired of sitting"+
		          " by her sister on the bank"
	},

	{
		expected: "${COLOR} ${RODENT} with pink eyes ran close by her",
		fact:     "White Rabbit with pink eyes ran close by her"
	},

	{
		expected: "$*'${LABEL/([A-Z ]+)/}'$*",
		fact:     "and round the neck of the bottle was a paper"+
				  " label, with the words 'DRINK ME' beautifully "+
				  "printed on it in large letters"
	},

	{
		expected: "$RODENT's little white kid gloves",
		fact:     "Rabbit's little white kid gloves"
	},

	{
		expected: "So $NAME began telling them her adventures from"+
				  " the time when she first saw the $COLOR $RODENT",
		fact:     "So Alice began telling them her adventures from"+
				  " the time when she first saw the White Rabbit"
	},

	{
		expected: "Behead that $RODENT2!",
		fact:     "Behead that Dormouse!"
	},

	{
		expected: "'The trial cannot proceed,' said the "+
				  "${MONARCH/King|Queen/}"+
				  " in a very grave voice",
		fact:     "'The trial cannot proceed,' said the King in a "+
		          "very grave voice"
	},

	{
		expected: "{${RODENT}}",
		fact:     "{Rabbit}"
	},

	{
		expected: "${RODENT",
		fact:     "${RODENT"
	},

	{
		expected: "$RODENT}",
		fact:     "Rabbit}"
	}

];

var negatives = [
	{
		expected: "So $NAME began telling them her adventures from"+
				  " the time when she first saw the $COLOR $RODENT",
		fact:     "So Alice began telling them her adventures from"+
				  " the time when she first saw the White Hare"
	},

	{
		expected: "So $NAME began telling them her adventures from"+
				  " the time when she first saw the $COLOR $RODENT",
		fact:     "So Alice began telling them her adventures from"+
				  " the time when she first saw the WhiteRabbit"
	},

	{
		expected: "Behead that $RODENT!",
		fact:     "Behead that Dormouse!"
	}

];

var variables = {
	NAME: "Alice",
	SIBLING: "sister",
	COLOR: "White",
	RODENT: "Rabbit",
	LABEL: "DRINK ME",
	RODENT2: "Dormouse",
	MONARCH: "King"
};


function test_lc () {
    var lc = new LearnedComparator();
    console.warn('TRUE STUFF');
    positives.forEach(function (sc) {
        var ret = lc.compare(sc.fact, sc.expected);
        console.log(ret.ok, ret);
    });
    console.warn('FALSE STUFF');
    negatives.forEach(function (sc) {
        var ret = lc.compare(sc.fact, sc.expected);
        console.log(ret.ok, ret);
    });
    console.warn('VARIABLES');
    console.log(lc.variables);
}

test_lc();

// # Grammar that we are parsing:
// #
// # ROOT = PROTO | BODY
// # PROTO = '{' BODY '}'
// # BODY = ITEM*
// # ITEM = VAR ':' VAL | VAR VAL
// # VAR = VAR_TOKEN
// # VAL = VAL_TOKEN | PROTO | LIST | ENUM_VAL
// # ENUM_VAL = '{' ELEMENT '}'
// # LIST = '[' VAL* ']'
// # VAR_TOKEN = (COMMENT) VAR_ELEMENT (COMMENT) | STRING
// # VAL_TOKEN = (COMMENT) VAL_ELEMENT (COMMENT) | STRING
// # VAR_ELEMENT = VAR_CHAR+
// # VAL_ELEMENT = VAL_CHAR+
// # STRING = '"' S2CHAR* '"' | "'" S1CHAR* '"'
// # COMMENT = '#' ANY* '\n'
// # VAL_CHAR = any non-whitespace, non-special character, non [] character:
// #            '#', ':', ';', '{', '}', '[', ']', '"', "'"
// # VAR_CHAR = any non-whitespace, non-special character:
// #            '#', ':', ';', '{', '}', '"', "'"
// # S1CHAR = any character except an un-escaped single quote
// # S2CHAR = any character except an un-escaped double quote
// # ANY = any character
// #
// # () means optional
// # *  means any number of repetitions
// # +  means one or more repetitions
// # |  means any one of
//
// outputs a ProtoList.  Every element of a ProtoList
// is either a ProtoObject or a string.  A ProtoObject
// maps from field name to ProtoList.
var protoviewer = {};

protoviewer.consume_regexp = function(text, ii, regexp) {
    for (var jj = ii;
            jj < text.length &&
            text.charAt(jj).match(regexp);
            jj++) {
    }
    return {'value': text.substr(ii, jj-ii), 'position': jj};
};

protoviewer.consume_whitespace = function(text, ii) {
    return protoviewer.consume_regexp(text, ii, /\s/).position;
};

protoviewer.consume_comments = function(text, ii) {
    ii = protoviewer.consume_whitespace(text, ii);
    if (text.charAt(ii) == "#") {
        while(text.charAt(ii++) != "\n") {
        }
    }
    ii = protoviewer.consume_whitespace(text, ii);
    return ii;
};

protoviewer.parse = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    ii = protoviewer.consumeWhitespace(text, ii);
    var has_braces = false;
    if (text.charAt(ii) == "{") {
        has_braces = true;
        ii++;
    }
    var result = protoviewer.parse_body(text, ii);
    if (result.error) {
        return result;
    }
    if (has_braces) {
        ii = result.position;
        ii = protoviewer.consume_whitespace(text, ii);
        if (text.charAt(ii) != "}") {
            result.error = "Missing Closing Brace";
        }
        result.position = ii;
    }
    return result;
};

protoviewer.parse_body = function(text, ii) {
    var result = {
        "value": [],
        "position": ii,
        "error": null,
    };
    while (text.length > ii) {
        var item = protoviewer.parse_item(text, ii);
        ii = item.position;
        result.value.push(item.value);
        if (item.error) {
            result.error = item.error);
            break;
        }
    }
    result.position = ii;
    return result;
};

protoviewer.parse_item = function(text, ii) {
    var result = {
        "position": ii,
        "value": {},
        "error": null,
    };
    ii = protoviewer.consume_whitespace(text);
    var name = protoviewer.parse_token(text, ii, /* include_brackets=*/true);

};

protoviewer.parse_token = function(text, ii, should_include_brackets) {
    ii = protoviewer.consume_comments(text, ii);
    var result;
    if (text.charAt(ii) == '"' || text.charAt(ii) == "'") {
        result = protoviewer.parse_string(text, ii);
    } else {
        var regexp = /\w/;
        if (should_include_brackets) {
            regexp = /\w\[\]/;
        }
        result = protoviewer.consume_regexp(regexp);
        result.error = null;
    }
    result.position = protoviewer.consume_comments(text, result.position);
    if (!result.value) {
        result.error = "Error parsing item, no name found: " + ii;
    }
    return result;
};


// # Grammar that we are parsing:
// #
// # ROOT = PROTO | BODY
// # PROTO = '{' BODY '}'
// # BODY = ( ITEM | , )*
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

protoviewer.parse_proto = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    ii = protoviewer.consume_whitespace(text, ii);
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
    if (!ii) {
        ii = 0;
    }
    var result = {
        "value": {},
        "position": ii,
        "error": null,
    };
    while (text.length > ii) {
        console.log("ii = " + ii);
        ii = protoviewer.consume_comments(text, ii);
        var name = protoviewer.parse_token(text, ii, /* include_brackets=*/true);
        if (name.error) {
            result.error = name.error;
            break;
        }
        ii = name.position;
        ii = protoviewer.consume_comments(text, ii);
        if (text.charAt(ii) == ":") {
            ii++;
        }
        ii = protoviewer.consume_comments(text, ii);
        var value = protoviewer.parse_value(text, ii);
        if (value.error) {
            result.error = value.error;
            break;
        } 
        ii = value.position;
        ii = protoviewer.consume_comments(text, ii);
        if (!(name in result.value)) {
            result.value[name.value] = [];
        }
        result.value[name.value].push(value.value);
        if (text.charAt(ii) == ",") {
            ii++;
            ii = protoviewer.consume_comments(text, ii);
        }
    }
    result.position = ii;
    return result;
};

protoviewer.parse_token = function(text, ii, should_include_brackets) {
    if (!ii) {
        ii = 0;
    }
    var result;
    if (text.charAt(ii) == '"' || text.charAt(ii) == "'") {
        result = protoviewer.parse_string(text, ii);
    } else {
        var regexp = /\w/;
        if (should_include_brackets) {
            regexp = /[\w\[\]]/;
        }
        result = protoviewer.consume_regexp(text, ii, regexp);
        result.error = null;
    }
    if (!result.value) {
        result.error = "Error parsing token at: " + ii + " = " + text.charAt(ii);
    }
    return result;
};

protoviewer.parse_string = function(text, ii) {
    // implement me
}

protoviewer.parse_value = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    if (text.charAt(ii) == "{") {
        // proto
        return protoviewer.parse_proto(text, ii);
    } else if (text.charAt(ii) == "[") {
        // list
        return protoviewer.parse_list(text, ii);
    } else {
        // don't try to handle enums
        return protoviewer.parse_token(text, ii);
    }
};

protoviewer.parse_list = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    if (text.charAt(ii) == "[") {
        ii++;
        ii = protoviewer.consume_comments(text, ii);
    }
    var result = {
        "value": [],
        "position": ii,
        "error": null,
    };
    while (text.length > ii && text.charAt(ii) != "]") {
        var item = protoviewer.parse_value(text, ii);
        if (item.error) {
            result.position = item.position;
            return result;
        }
        ii = item.position;
        ii = protoviewer.consume_comments(text, ii);
        result.value.push(item.value);
    }
    result.position = ii;
    if (text.length > ii) {
        // error
    } else if (text.charAt(ii) == "]") {
        ii++;
        ii = protoviewer.consume_comments(text, ii);
    }
    return result;
}


// # Grammar that we are parsing:
// #
// # ROOT = PROTO | BODY
// # PROTO = '{' BODY '}'
// # BODY = ITEM*
// # ITEM = VAR ':' VAL | VAR VAL
// # VAR = VARTOKEN
// # VAL = VALTOKEN | PROTO | LIST | ENUM_VAL
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
var protoviewer = {}

protoviewer.consumeRegexp = function(expression, ii, regexp) {
    for (var jj = ii;
            jj < expression.length &&
            expression.charAt(jj).match(regexp);
            jj++) {
    }
    return {'value': expression.substr(ii, jj-ii), 'position': jj};
}

protoviewer.consumeWhitespace = function(expression, ii) {
    return protoviewer.consumeRegexp(expression, ii, /\s/).position;
}


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
        ii = protoviewer.consumeWhitespace(text, ii);
        if (text.charAt(ii) != "}") {
            result.error = "Missing Closing Brace";
        }
        result.position = ii;
    }
    return result;
}

protoviewer.parse_body = function(text, ii) {
}




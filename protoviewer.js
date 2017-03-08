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
//
// To be clear, a ProtoList is just represented with a regular list.
// A ProtoObject is just a regular object.  There are no special
// types defined, it's just that when you get a proto, you can
// assume that this is the structure they will have.
var protoviewer = {};

// a helper function for making error messages
protoviewer.make_error = function(message, text, ii, len) {
    if (!len) {
        len = 10;
    }
    return message + " at: " + ii + " = " +
        text.charAt(ii) + " (" + text.substr(ii - len, len*2) + ")";
};

protoviewer.consume_regexp = function(text, ii, regexp) {
    for (var jj = ii;
            jj < text.length && text.charAt(jj).match(regexp);
            jj++) {
    }
    return {
        value: text.substr(ii, jj-ii),
        position: jj,
        error: null,
    };
};

protoviewer.consume_whitespace = function(text, ii) {
    return protoviewer.consume_regexp(text, ii, /\s/).position;
};

protoviewer.consume_comments = function(text, ii) {
    ii = protoviewer.consume_whitespace(text, ii);
    while (ii < text.length && text.charAt(ii) == "#") {
        while(text.charAt(ii++) != "\n") {
        }
        ii = protoviewer.consume_whitespace(text, ii);
    }
    return ii;
};

// This is the top level function to call to parse a
// in TextFormat.  The return value is an object
// with these values:
// {
//     value:
//         the proto
//     position:
//         the position in the text after
//         reading this proto
//     error:
//         an error message, if there was a
//         problem parsing the proto
//         null if there were no problems
// }
// The proto value will be an object of
// lists of objects of lists of objects ...
//
// This is also the return value of all the "parse_..." functions
// in this file.
protoviewer.parse_proto = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    ii = protoviewer.consume_comments(text, ii);
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
        ii = protoviewer.consume_comments(text, ii);
        if (text.charAt(ii) != "}") {
            result.error = "Missing Closing Brace";
        } else {
            ii++;
        }
        ii = protoviewer.consume_comments(text, ii);
        result.position = ii;
    }
    return result;
};

protoviewer.parse_body = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    var result = {
        value: {},
        position: ii,
        error: null,
    };
    while (text.length > ii && text.charAt(ii) != "}") {
        var old_ii = ii;
        ii = protoviewer.consume_comments(text, ii);
        var name = protoviewer.parse_token(text, ii, /* include_brackets=*/true);
        if (name.error) {
            // should this really be an error?  Or is this just the end of the proto?
            result.error = name.error;
            break;
        }
        // for debugging:
        // console.log(name.value);
        ii = name.position;
        ii = protoviewer.consume_comments(text, ii);
        if (text.charAt(ii) == ":") {
            ii++;
        }
        ii = protoviewer.consume_comments(text, ii);
        var value = protoviewer.parse_value(text, ii);
        if (value.position) {
            ii = value.position;
        }
        ii = protoviewer.consume_comments(text, ii);
        if (!(name.value in result.value)) {
            result.value[name.value] = [];
        }
        result.value[name.value].push(value.value);
        if (value.error) {
            result.error = value.error;
            break;
        }
        if (text.charAt(ii) == ",") {
            ii++;
            ii = protoviewer.consume_comments(text, ii);
        }
        if (ii == old_ii) {
            // This can happen if there is an unrecognized character
            result.error = protoviewer.make_error("Internal error!  Infinite loop", text, ii);
            break;
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
        var regexp = /[\w\.\-\+]/;
        if (should_include_brackets) {
            regexp = /[\w\.\[\]\-\+]/;
        }
        result = protoviewer.consume_regexp(text, ii, regexp);
        result.error = null;
    }
    if (!protoviewer.is_defined(result.value)) {
        result.error = protoviewer.make_error("Error parsing token", text, ii);
    }
    return result;
};

protoviewer.parse_string = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    var quote = text.charAt(ii);
    if (text.charAt(ii) != "'" && text.charAt(ii) != '"') {
        return {
            value: "",
            position: ii,
            error: "Invalid string, doesn't start with quote: " + quote,
        }; 
    }
    var result = {
        value: [],
        error: null,
        position: ii,
    };
    var jj = ii + 1;
    for ( ; jj < text.length; jj++) {
        if (text.charAt(jj) == quote) {
            break;
        }
        if (text.charAt(jj) == "\\") {
            jj++;
        }
        result.value.push(text.charAt(jj));
    }
    result.value = result.value.join("");
    result.position = jj;
    if (jj >= text.length) {
        result.error = "No end of string found: " + ii;
    } else if (text.charAt(jj) == quote) {
        jj++;
        jj = protoviewer.consume_comments(text, jj);
        result.position = jj;
    }
    return result;
};

protoviewer.parse_value = function(text, ii) {
    if (!ii) {
        ii = 0;
    }
    if (text.charAt(ii) == "{") {
        return protoviewer.parse_proto(text, ii);
    } else if (text.charAt(ii) == "[") {
        return protoviewer.parse_list(text, ii);
    } else {
        // we don't try to handle enums yet
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
        value: [],
        position: ii,
        error: null,
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
    if (text.length <= ii) {
        result.error = "No end of list found: ";
    } else if (text.charAt(ii) == "]") {
        ii++;
        ii = protoviewer.consume_comments(text, ii);
        result.position = ii;
    }
    return result;
};

// the proto info object should be an object with the same structure
// as the proto, but instead of holding values, it holds metadata, like
// the depth.
// Currently, the only metadata is the depth, so we should probably just
// name it that way.
protoviewer.make_proto_info = function(proto, attributes) {
    var proto_info = {};
    for (var name in proto) {
        proto_info[name] = [];
        for (var ii = 0; ii < proto[name].length; ii++ ) {
            if (protoviewer.is_object(proto[name][ii])) {
                proto_info[name][ii] = protoviewer.make_proto_info(proto[name][ii], attributes);
            } else {
                proto_info[name][ii] = {};
                for (attr in attributes) {
                    proto_info[name][ii][attr] = attributes[attr].leaf_function(name, ii, proto[name][ii]);
                }
            }
        }
        for (attr in attributes) {
            proto_info[name][attr] = attributes[attr].aggregator(name, proto_info[name]);
        }
    }
    return proto_info;
};

protoviewer.get_depth_info = function(proto) {
    return protoviewer.make_proto_info(proto, {depth: {
        leaf_function: function(name, ii, value) {
            return 0;
        },
        aggregator: function(name, infos) {
            var depth = 0;
            for (var ii = 0; ii < infos.length; ii++) {
                for (var subname in infos[ii]) {
                    if (infos[ii][subname].depth + 1 > depth) {
                        depth = infos[ii][subname].depth + 1;
                    }
                }
            }
            return depth;
        },
    }});
};

// unused
protoviewer.get_expand_info = function(proto, pattern) {
    var match = function(str, pattern) {
        return str == pattern;
    };
    return protoviewer.make_proto_info(proto, {depth: {
        leaf_function: function(name, ii, value) {
            return match(name, pattern) || match(value, pattern);
        },
        aggregator: function(name, infos) {
            for (var ii = 0; ii < infos.length; ii++) {
                for (var subname in infos[ii]) {
                    if (infos[ii][subname].expand) {
                        return true;
                    }
                }
            }
            return match(name, pattern);
        },
    }});
};

// ------------------------------------------------------------------ //

protoviewer.draw_proto = function(
        elt, proto, should_not_add_ul, 
        add_collapse_expand, info) {
    var list = elt;
    var collapse, expand;
    if (add_collapse_expand) {
        collapse = protoviewer.add_child_element(elt, "input");
        expand = protoviewer.add_child_element(elt, "input");
    }
    if (!should_not_add_ul) {
        list = protoviewer.add_child_element(elt, "ul");
    }
    if (add_collapse_expand) {
        collapse.setAttribute("type", "button");
        collapse.setAttribute("value", "-");
        protoviewer.add_event_listener(collapse, "click", function() {
            protoviewer.set_expansion(list, function() { return false; });
        });
        expand.setAttribute("type", "button");
        expand.setAttribute("value", "+");
        protoviewer.add_event_listener(expand, "click", function() {
            protoviewer.set_expansion(list, function() { return true; });
        });
    }
    if (!info) {
        info = protoviewer.get_depth_info(proto);
    }
    for (var name in proto) {
        for (var ii = 0; ii < proto[name].length; ii++ ) {
            var li = protoviewer.add_child_element(list, "li");
            protoviewer.add_child_text(li, "" + name + " (" +
                    info[name].depth + ")");
            if (protoviewer.is_object(proto[name][ii])) {
                protoviewer.draw_proto(
                        li, proto[name][ii], false,
                        add_collapse_expand, info[name][ii]);
            } else {
                protoviewer.add_child_text(li, ": " + proto[name][ii]);
            }
        }
    }
};

protoviewer.is_defined = function(obj) {
    return typeof obj !== 'undefined';
};

protoviewer.is_object = function(obj) {
    return (obj !== null && typeof obj === 'object');
};

protoviewer.add_child_text = function(par, text) {
    par.innerHTML += text;
    return par;
    var elt = document.createTextNode(text);
    par.appendChild(elt);
    return elt;
};

protoviewer.add_child_element = function(par, type) {
    var elt = document.createElement(type);
    par.appendChild(elt);
    return elt;
};

protoviewer.set_toggle_display = function(button_id, elt_id) {
    var button = document.getElementById(button_id);
    this.add_event_listener(button, "click", function() {
        protoviewer.toggle_display(elt_id);
    });
    return this;
};

protoviewer.toggle_display = function(elt_id) {
    var elt = document.getElementById(elt_id);
    var display = elt.style.display;
    if (display == "none") {
        elt.style.display = "inline";
    } else {
        elt.style.display = "none";
    }
    return elt;
};

protoviewer.add_event_listener = function(elt, type, func) {
    if (elt.addEventListener) {
        elt.addEventListener(type, func, false);
        return true;
    } else if (elt.attachEvent) {
        return elt.attachEvent("on" + type, func);
    } else {
        return false;
    }
};

protoviewer.remove_children = function(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
};

protoviewer.matches_pattern = function(string, pattern, case_sensitive) {
    if (case_sensitive) {
        return string.includes(pattern);
    } else {
        return string.toLowerCase().includes(pattern.toLowerCase());
    }
};

protoviewer.set_node_state = function(node, should_close) {
    if ((CollapsibleLists.isClosed(node) && !should_close) ||
            (!CollapsibleLists.isClosed(node) && should_close)) {
        CollapsibleLists.toggle(node);
    }
};

protoviewer.set_expansion_by_pattern = function(ul, pattern) {
    return protoviewer.set_expansion(ul, function(node) {
        return protoviewer.matches_pattern(node.nodeValue, pattern);
    });
};

protoviewer.set_expansion = function(ul, predicate) {
    var ul_has_match = false;
    for (var ii = 0; ii < ul.childNodes.length; ii++) {
        var child = ul.childNodes[ii];
        if (child.nodeName != "LI") {
            continue;
        }
        var li_has_match = false;
        for (var jj = 0; jj < child.childNodes.length; jj++) {
            var grandchild = child.childNodes[jj];
            if (grandchild.nodeName == "#text") {
                if (predicate(grandchild)) {
                    li_has_match = true;
                }
            } else if (grandchild.nodeName == "UL") {
                var is_match = protoviewer.set_expansion(grandchild, predicate);
                if (is_match) {
                    li_has_match = true;
                }
            }
        }
        protoviewer.set_node_state(child, !li_has_match);
        if (li_has_match) {
            ul_has_match = true;
        }
    }
    protoviewer.set_node_state(ul, !ul_has_match);
    return ul_has_match;
};

protoviewer.main = function() {
    protoviewer.GLOBAL_PROTO = null;
    var parse_button = document.getElementById("parse");
    protoviewer.add_event_listener(parse_button, "click", function() {
        var input = document.getElementById("input");
        protoviewer.GLOBAL_PROTO = protoviewer.parse_proto(input.value);
        console.log(protoviewer.GLOBAL_PROTO);
        var output = document.getElementById("tree");
        protoviewer.remove_children(output);
        protoviewer.draw_proto(output, protoviewer.GLOBAL_PROTO.value, true, true);
        CollapsibleLists.applyTo(document.getElementById('tree'));
    });
    var search_button = document.getElementById("search_button");
    protoviewer.add_event_listener(search_button, "click", function() {
        var pattern = document.getElementById("search");
        //var expand = protoviewer.get_expand_info(protoviewer.GLOBAL_PROTO, pattern);
        var tree = document.getElementById("tree");
        protoviewer.set_expansion_by_pattern(tree, pattern.value);
    });
};


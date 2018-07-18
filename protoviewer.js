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
        while(ii < text.length && text.charAt(ii++) != "\n") {
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
//
// If filter_func is defined, it should either be a function that takes a
// string and returns a bool.  This function will be applied to all field
// names as we traverse the proto.  If it returns true for any field name,
// that field and its value (which could be a sub-proto) will be excluded.
//
protoviewer.parse_proto = function(text, ii, filter_func) {
    if (!ii) {
        ii = 0;
    }
    ii = protoviewer.consume_comments(text, ii);
    var has_braces = false;
    if (text.charAt(ii) == "{") {
        has_braces = true;
        ii++;
    }
    var result = protoviewer.parse_body(text, ii, filter_func);
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

protoviewer.parse_body = function(text, ii, filter_func) {
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
        var value = protoviewer.parse_value(text, ii, filter_func);
        if (value.position) {
            ii = value.position;
        }
        ii = protoviewer.consume_comments(text, ii);
        if (!filter_func || !filter_func(name.value)) {
          if (!(name.value in result.value)) {
            result.value[name.value] = [];
          }
          result.value[name.value].push(value.value);
        }
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
        var regexp = /[\w\.\-\+\/]/;
        if (should_include_brackets) {
            regexp = /[\w\.\[\]\-\+\/]/;
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
        value: [text.charAt(ii)],
        error: null,
        position: ii,
    };
    var jj = ii + 1;
    var escape = false;
    for ( ; jj < text.length; jj++) {
        result.value.push(text.charAt(jj));
        if (!escape && text.charAt(jj) == quote) {
            break;
        }
        if (!escape && text.charAt(jj) == "\\") {
            escape = true;
        } else {
            escape = false;
        }
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

protoviewer.parse_value = function(text, ii, filter_func) {
    if (!ii) {
        ii = 0;
    }
    if (text.charAt(ii) == "{") {
      return protoviewer.parse_proto(text, ii, filter_func);
    } else if (text.charAt(ii) == "[") {
      return protoviewer.parse_list(text, ii, filter_func);
    } else {
        // we don't try to handle enums yet
        return protoviewer.parse_token(text, ii);
    }
};

protoviewer.parse_list = function(text, ii, filter_func) {
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
        var old_ii = ii;
        var item = protoviewer.parse_value(text, ii, filter_func);
        if (item.error) {
            result.position = item.position;
            return result;
        }
        ii = item.position;
        ii = protoviewer.consume_comments(text, ii);
        result.value.push(item.value);
        if (text.length > ii && text.charAt(ii) == ",") {
            ii++;
            ii = protoviewer.consume_comments(text, ii);
        }
        if (old_ii == ii) {
            result.error = protoviewer.make_error("Error parsing list, unrecognized character", text, ii);
            break;
        }
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

// the proto info object is sort of like an object with the same structure
// as the proto, but instead of holding values, it holds metadata, like
// the depth.
//
// However, normal protos essentially only have values at the leaves, not
// at the edges.  But proto info objects have values at every node.  In
// order to accomodate that much more data, they need to have a sort of
// convoluted structure where the data of the tree sits in a separate
// place from the structure (edges) of the tree:
//
// AttrProtoDict = values: { names to AttrProtoLists }
//                   data: { names to attrs to values = total for each protolist }
//                  total: { attrs to values = aggregate over data }
//
// AttrProtoList = values: [ {attrs to values} or AttrProtoDict ]
//                   data: { attrs to [values = either the leaf value or the AttrProtoDict total ] }
//                  total: { attrs to values = aggregate over data }
//
// The proto argument is the proto to compute metadata over.
// The attributes argument tells you what meta data to compute.
// It is a map from the name of the attribute to compute
// to a map with two functions (so each attribute has two functions):
//   - leaf_function: computes the value of the attribute for a leaf
//     node of the proto, given the name, value, and index in the ProtoList.
//   - aggregator: computes a new value for the attribute, given a list
//     of the values for the sub proto.  This is called to aggregate
//     the values over ProtoLists and again to aggregate values over
//     ProtoDicts
//
// Currently, the only metadata we use this to compute is the depth
protoviewer.make_proto_info = function(proto, attributes) {
    var proto_info = {values: {}, data: {}, total: {}};
    for (var name in proto) {
        proto_info.values[name] = {values: [], data: {}, total: {}};
        for (attr in attributes) {
            proto_info.values[name].data[attr] = [];
        }
        for (var ii = 0; ii < proto[name].length; ii++ ) {
            if (protoviewer.is_object(proto[name][ii])) {
                proto_info.values[name].values[ii] = protoviewer.make_proto_info(proto[name][ii], attributes);
                for (attr in attributes) {
                    proto_info.values[name].data[attr].push(proto_info.values[name].values[ii].total[attr]);
                }
            } else {
                proto_info.values[name].values[ii] = {};
                for (attr in attributes) {
                    proto_info.values[name].values[ii][attr] = attributes[attr].leaf_function(name, ii, proto[name][ii]);
                    proto_info.values[name].data[attr].push(proto_info.values[name].values[ii][attr]);
                }
            }
        }
        for (attr in attributes) {
            proto_info.values[name].total[attr] = attributes[attr].aggregator("list", proto_info.values[name].data[attr]); 
            if (!(attr in proto_info.data)) {
                proto_info.data[attr] = [];
            }
            proto_info.data[attr].push(proto_info.values[name].total[attr]);
        }
    }
    for (attr in attributes) {
        if (!(attr in proto_info.data)) {
            proto_info.data[attr] = [];
        }
        proto_info.total[attr] = attributes[attr].aggregator("map", proto_info.data[attr]);
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
                var val = infos[ii];
                if (name == "map") {
                    val += 1;
                }
                if (val > depth) {
                    depth = val;
                }
            }
            return depth;
        },
    }});
};

// unused.  it's supposed to determine which nodes to expand
// in order to show all nodes or leaves that match the pattern
protoviewer.get_expand_info = function(proto, pattern) {
    var match = function(str, pattern) {
        return str == pattern;
    };
    return protoviewer.make_proto_info(proto, {expand: {
        leaf_function: function(name, ii, value) {
            return match(name, pattern) || match(value, pattern);
        },
        aggregator: function(name, infos) {
            for (var ii = 0; ii < infos.length; ii++) {
                if (infos[ii]) {
                    return true;
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
        if (protoviewer.is_array(proto[name])) {
            for (var ii = 0; ii < proto[name].length; ii++ ) {
                var li = protoviewer.add_child_element(list, "li");
                protoviewer.add_child_text(li, "" + name + " (" +
                        info.values[name].data.depth[ii] + ")");
                if (protoviewer.is_object(proto[name][ii])) {
                    protoviewer.draw_proto(
                            li, proto[name][ii], false,
                            add_collapse_expand, info.values[name].values[ii]);
                } else {
                    protoviewer.add_child_text(li, ": " + proto[name][ii]);
                }
            }
        } else {
            var li = protoviewer.add_child_element(list, "li");
            protoviewer.add_child_text(li, proto[name]);
        }
    }
};

protoviewer.is_defined = function(obj) {
    return typeof obj !== 'undefined';
};

// This is true for Arrays as well.
protoviewer.is_object = function(obj) {
    return (obj !== null && typeof obj === 'object');
};

protoviewer.is_array = function(obj) {
    return Array.isArray(obj);
};

protoviewer.is_sub_proto = function(obj) {
    return protoviewer.is_object(obj) && !protoviewer.is_array(obj);
};

protoviewer.is_string = function(obj) {
  return (typeof obj === 'string' || obj instanceof String);
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

// Given a proto, create a new proto which is like the original,
// except that we pass each field name to should_filter_func and
// if that function returns true, we remove that field.
protoviewer.filter_proto = function(proto, should_filter_func) {
    var new_proto = {};
    for (var key in proto) {
        if (should_filter_func(key)) {
            continue;
        }
        new_proto[key] = [];
        for (var ii = 0; ii < proto[key].length; ii++) {
            if (protoviewer.is_sub_proto(proto[key][ii])) {
                new_proto[key].push(protoviewer.filter_proto(proto[key][ii], should_filter_func));
            } else {
                new_proto[key].push(proto[key][ii]);
            }
        }
    }
    return new_proto;
};

// return a slice of a proto: for any leaf node, if should_keep_slice_func returns true,
// then keep it and all of its parents.
//
// This isn't quite working yet...
protoviewer.proto_slice = function(proto, should_keep_slice_func) {
    var new_proto = {};
    for (var key in proto) {
        for (var ii = 0; ii < proto[key].length; ii++) {
            if (protoviewer.is_sub_proto(proto[key][ii])) {
                if (!(key in new_proto)) {
                    new_proto[key] = [];
                }
                new_proto[key].push(protoviewer.proto_slice(proto[key][ii], should_keep_slice_func));
            } else {
                if (should_keep_slice_func(key, proto[key][ii])) {
                    if (!(key in new_proto)) {
                        new_proto[key] = [];
                    }
                    new_proto[key].push(proto[key][ii]);
                }
            }
        }
    }
    return new_proto;
};

protoviewer.slice_by_pattern = function(proto, pattern) {
    return protoviewer.proto_slice(
        proto,
        function(name, val) {
            return protoviewer.matches_pattern(protoviewer.format(val), pattern);
        });
}

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

protoviewer.format = function(proto, flat, indent) {
  var str = "";
  if (!protoviewer.is_defined(indent)) {
    indent = "";
  }
  for (var key in proto) {
    for (var ii = 0; ii < proto[key].length; ii++) {
      if (!flat) {
        str += indent;
      }
      str += key;
      if (protoviewer.is_array(proto[key][ii])) {
        str += ": [ ";
        for (var jj = 0; jj < proto[key][ii].length; jj++) {
          str += proto[key][ii][jj];
          if (jj < proto[key][ii].length - 1) {
            str += ", ";
          }
        }
        str += " ]";
      } else if (protoviewer.is_object(proto[key][ii])) {
        str += " { ";
        if (!flat) {
          str += "\n";
        }
        str += protoviewer.format(proto[key][ii], flat, indent + "  ");
        if (!flat) {
          str += indent;
        }
        str += " }";
      } else {
        str += ": ";
        var num = Number(proto[key][ii]);
        str += proto[key][ii];
      }
      if (ii < proto[key].length - 1) {
        if (!flat) {
          str += "\n";
        } else {
          str += " ";
        }
      }
    }
    if (!flat) {
      str += "\n";
    } else {
      str += " ";
    }
  }
  return str;
};

protoviewer.convert = function(proto, paths) {
  var retval = {};
  for (var key in proto) {
    if (key in paths) {
      if (paths[key][0] !== null) {
        retval[paths[key][0]] = protoviewer.convert_list(proto[key], paths[key][1]);
      } else {
        // If the first element of the path is null, that means
        // drop this level of the proto tree
        var newlist = protoviewer.convert_list(proto[key], paths[key][1]);
        for (var ii = 0; ii < newlist.length; ii++) {
          if (protoviewer.is_object(newlist[ii])) {
            // non objects just get dropped
            for (subkey in newlist[ii]) {
              retval[subkey] = newlist[ii][subkey];
            }
          }
        }
      }
    } else {
      retval[key] = proto[key];
    }
  }
  return retval;
};

protoviewer.convert_list = function(list, paths) {
  var retval = [];
  for (var ii = 0; ii < list.length; ii++) {
    if (protoviewer.is_object(list[ii])) {
      retval.push(protoviewer.convert(list[ii], paths));
    } else {
      retval.push(list[ii]);
    }
  }
  return retval;
};

// protoviewer.format(protoviewer.discourse_convert(protoviewer.GLOBAL_PROTO.value), true)

protoviewer.discourse_convert = function(proto) {
  return protoviewer.convert(proto, {
    'dialog_turn_intent': ['dialog_context', {
      'user_turn_feature': ['dialog_feature', {
        'feature_name': ["name", {}],
        'feature_weight': ["value", {}],
      }],
      '[quality.dialog_manager.DialogCoreConfig.dialog_core_config]': [null, {
        'user_turn_field': ["dialog_field", {}],
      }],
      'advance': [null, {}],
      'conversation_id': [null, {}],
      'initial_trigger': [null, {}],
      'issued_system_turn_count': [null, {}],
    }],
  });
};

protoviewer.main = function() {
    protoviewer.GLOBAL_PROTO = null;
    var parse_button = document.getElementById("parse");
    protoviewer.add_event_listener(parse_button, "click", function() {
        var input = document.getElementById("input");
        var filter = document.getElementById("filter");
        var filter_func;
        if (filter) {
            filter_func = function(str) {
                return str == filter.value;
            };
        }
        protoviewer.GLOBAL_PROTO = protoviewer.parse_proto(
            input.value/*.replace(/\\/g, "\\\\")*/, 0, filter_func);
        console.log(protoviewer.GLOBAL_PROTO);
        var output = document.getElementById("tree");
        protoviewer.remove_children(output);
        protoviewer.draw_proto(output, protoviewer.GLOBAL_PROTO.value, true, true);
        CollapsibleLists.applyTo(document.getElementById('tree'));
        var parsed = document.getElementById("parsed");
        if (parsed) {
            parsed.value = protoviewer.format(protoviewer.GLOBAL_PROTO.value);
        }
    });
    var search_button = document.getElementById("search_button");
    protoviewer.add_event_listener(search_button, "click", function() {
        var pattern = document.getElementById("search");
        //var expand = protoviewer.get_expand_info(protoviewer.GLOBAL_PROTO, pattern);
        var tree = document.getElementById("tree");
        protoviewer.set_expansion_by_pattern(tree, pattern.value);
    });
};

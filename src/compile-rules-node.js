/*
 * Node rules
 *
 */
var RE_BEGIN = /^\s*/.source;
var RE_END = /\s*$/.source;
var RE_IDENTIFIER = /([\w\.\-]+)/.source;
var RE_IDENTIFIER_PIPE = /([\w\.\-]+)\s*(?:\|(.*))?/.source;

module.exports = [
  /**
   * {{var}}
   */
  {
    id: 'var',
    match: function(node) {
      return node.innerHTML.match(RegExp(RE_BEGIN + RE_IDENTIFIER_PIPE + RE_END));
    },
    prop: function(match) {
      return match;
    },
    rule: function(fragment, model, prop) {
      var textNode = document.createTextNode(jtmpl._get(model, prop[1], prop[2]) || '');
      fragment.appendChild(textNode);
      model.on('change', prop[1], function() {
        textNode.data = jtmpl._get(model, prop[1], prop[2]) || '';
      });
    }
  },



  /**
   * {{&var}}
   */
  {
    id: 'not_var',
    match: function(node) {
      return node.innerHTML.match(RegExp(RE_BEGIN + '&' + RE_IDENTIFIER + RE_END));
    },
    prop: function(match) {
      return match;
    },
    rule: function(fragment, model, prop) {

      // Anchor node for keeping section location
      var anchor = document.createComment('');
      // Number of rendered nodes
      var length = 0;

      function change() {
        var frag = document.createDocumentFragment();
        var el = document.createElement('body');
        var i;

        // Delete old rendering
        while (length) {
          anchor.parentNode.removeChild(anchor.previousSibling);
          length--;
        }

        el.innerHTML = jtmpl._get(model, prop[1], prop[2]) || '';
        length = el.childNodes.length;
        for (i = 0; i < length; i++) {
          frag.appendChild(el.childNodes[0]);
        }
        anchor.parentNode.insertBefore(frag, anchor);
      }

      fragment.appendChild(anchor);
      model.on('change', prop[1], change);
      change();
    }
  },



  /**
   * {{>partial}}
   */
  {
    id: 'partial',
    match: function(node) {
      // match: [1]=var_name, [2]='single-quoted' [3]="double-quoted"
      return node.innerHTML.match(/>([\w\.\-]+)|'([^\']*)\'|"([^"]*)"/);
    },
    prop: function(match) {
      return match;
    },
    rule: function(fragment, model, match) {
      var anchor = document.createComment('');
      var target;

      function loader() {
        if (!target) {
          target = anchor.parentNode;
        }
        jtmpl.loader(
          target,
          match[1] ?
            // Variable
            model(match[1]) :
            // Literal
            match[2] || match[3],
          model
        );
      }
      if (match[1]) {
        // Variable
        model.on('change', match[1], loader);
      }
      fragment.appendChild(anchor);
      // Load async
      setTimeout(loader);
    }
  },



  /**
   * {{#section}}
   */
  {
    id: 'section',
    match: function(node) {
      return node.innerHTML.match(RegExp(RE_BEGIN + '#' + RE_IDENTIFIER_PIPE + RE_END));
    },
    block: function(match) {
      return match;
    },
    rule: function(fragment, model, prop, template) {

      // Anchor node for keeping section location
      var anchor = document.createComment('');
      // Number of rendered nodes
      var length = 0;
      // How many childNodes in one section item
      var chunkSize;

      function update(i) {
        return function() {
          var parent = anchor.parentNode;
          var anchorIndex = [].indexOf.call(parent.childNodes, anchor);
          var pos = anchorIndex - length + i * chunkSize;
          var size = chunkSize;
          var arr = jtmpl.applyPipe(
            prop[1] === '.' ? model : model(prop[1]),
            prop[2],
            model
          );

          while (size--) {
            parent.removeChild(parent.childNodes[pos]);
          }
          parent.insertBefore(
            template(arr(i)),
            parent.childNodes[pos]
          );
        };
      }

      function insert(index, count) {
        var parent = anchor.parentNode;
        var i, fragment, render;
        var arr = prop[1] === '.' ? model : model(prop[1]);//jtmpl._get(model, prop[1], prop[2]);

        for (i = 0, fragment = document.createDocumentFragment();
            i < count; i++) {
          render = template(arr(index + i));
          chunkSize = render.childNodes.length;
          fragment.appendChild(render);
        }

        var anchorIndex = [].indexOf.call(parent.childNodes, anchor);
        var pos = anchorIndex - length + index * chunkSize;
        var size = count * chunkSize;

        parent.insertBefore(fragment, parent.childNodes[pos]);
        length = length + size;
      }

      function del(index, count) {
        var parent = anchor.parentNode;
        var anchorIndex = [].indexOf.call(parent.childNodes, anchor);
        var pos = anchorIndex - length + index * chunkSize;
        var size = count * chunkSize;

        length = length - size;

        while (size--) {
          parent.removeChild(parent.childNodes[pos]);
        }
      }

      function change() {
        var val = jtmpl.applyPipe(
          prop[1] === '.' ? model : model(prop[1]),
          prop[2] || '',
          model
        );
        var i, len, render;

        // Delete old rendering
        while (length) {
          anchor.parentNode.removeChild(anchor.previousSibling);
          length--;
        }

        // Array?
        if (typeof val === 'function' && val.len !== undefined) {
          val.on('insert', insert);
          val.on('delete', del);
          render = document.createDocumentFragment();

          //console.log('rendering ' + val.len + ' values');
          var child, childModel;
          for (i = 0, len = val.values.length; i < len; i++) {
            // TODO: implement event delegation for array indexes
            // Also, using val.values[i] instead of val[i]
            // saves A LOT of heap memory. Figure out how to do
            // on demand model creation.
            //val.on('change', i, update(i));
            //render.appendChild(eval(template + '(val(i))'));
            //render.appendChild(template(val.values[i]));
            childModel = val(i);
            child = template(childModel);
            child.__jtmpl__ = childModel;
            render.appendChild(child);
          }

          val.on('change', update);

          length = render.childNodes.length;
          chunkSize = ~~(length / len);
          anchor.parentNode.insertBefore(render, anchor);
        }

        // Object?
        else if (typeof val === 'function' && val.len === undefined) {
          render = template(val);
          length = render.childNodes.length;
          chunkSize = length;
          anchor.parentNode.insertBefore(render, anchor);
          anchor.parentNode.__jtmpl__ = model;
        }

        // Cast to boolean
        else {
          if (!!val) {
            render = template(model);
            length = render.childNodes.length;
            chunkSize = length;
            anchor.parentNode.insertBefore(render, anchor);
          }
        }
      }

      fragment.appendChild(anchor);
      change();
      model.on('change', prop[1], change);
    }
  },



  /**
   * {{^inverted_section}}
   */
  {
    id: 'inverted_section',
    match: function(node) {
      return node.innerHTML.match(RE_BEGIN + '\\^' + RE_IDENTIFIER_PIPE + RE_END);
    },
    block: function(match) {
      return match;
    },
    rule: function(fragment, model, prop, template) {

      // Anchor node for keeping section location
      var anchor = document.createComment('');
      // Number of rendered nodes
      var length = 0;

      function change() {
        var val = prop[1] === '.' ? model : model(prop[1]); //jtmpl._get(model, prop[1], prop[2]);
        var i, len, render;

        // Delete old rendering
        while (length) {
          anchor.parentNode.removeChild(anchor.previousSibling);
          length--;
        }

        // Array?
        if (typeof val === 'function' && val.len !== undefined) {
          val.on('insert', change);
          val.on('delete', change);
          render = document.createDocumentFragment();

          if (val.len === 0) {
            render.appendChild(template(val(i)));
          }

          length = render.childNodes.length;
          anchor.parentNode.insertBefore(render, anchor);
        }
        // Cast to boolean
        else {
          if (!val) {
            render = template(model);
            length = render.childNodes.length;
            anchor.parentNode.insertBefore(render, anchor);
          }
        }
      }

      fragment.appendChild(anchor);
      change();
      model.on('change', prop[1], change);
    }

  },


  /*
   * Fallback rule, not recognized jtmpl tag, emit verbatim
   */
  {
    id: 'emit_verbatim',
    match: function(node) {
      return node.innerHTML;
    },
    prop: function(match) {
      return match;
    },
    rule: function(fragment, model, match) {
      fragment.appendChild(document.createTextNode(match));
    }
  }
];

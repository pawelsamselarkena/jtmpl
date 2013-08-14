/**
 * jtmpl
 * @author Atanas Minev
 * MIT license
 */
function jtmpl(el, tpl, model) {
	var target, self;

	self = {

		re: new RegExp('{{({)?(\\#|\\^|\\/)?([\\w\\.]+)(})?}}', 'g'),
		tpl: tpl,
		model: model,
		tags: [],

		_get: function(v, context) {
			/*jslint evil:true */// ]:)
			context = context || self.model;
			return eval('context' + (v==='.' ? '' : '.' + v));
		},

		_build: function (tpl, context, pos, tag) {
			var out = '', s, t, v, i, idx, collection,
				// return unemitted markup
				catchUp = function() {
					return tpl.slice(pos, self.re.lastIndex - t[0].length);
				},
				// detect HTML element index and property to bind model to, rememer tag
				pushTag = function(t) {

					(tag ? self.tags[self.tags.length - 1].children : self.tags).push(t);
				};

			pos = pos || 0;

			t = self.re.exec(tpl);
			while (t) { 
				// {{/block_tag_end}} ?
				if (t[2] === '/') {

					// end tag matches begin tag?
					if (tag && t[3] !== tag[3]) {
						err = 'Expected {{/' + tag[3] + '}}, got ' + t[0];
						console.log(err);
						throw err;
					}

					// exit recursion
					return out + catchUp();
				}

				// {{var}} ?
				if (!t[2]) {
					out += catchUp() + (self._get(t[3], context) || '');
					pos = self.re.lastIndex;
					pushTag({
						type: 'var',
						value: self._get(t[3], context)
					});
				}

				// {{#block_tag_begin}} or {{^not_block_tag_begin}} ?
				if (t[2] === '#' || t[2] === '^') {

					v = self._get(t[3], context);
					pushTag({
						type: 'block',
						neg: t[2] === '^',
						children: []
					});

					// falsy value?
					if (!v) {
						out += catchUp();
						s = self._build(tpl, v, self.re.lastIndex, t);					
						pos = self.re.lastIndex;
						out += t[2] === '#' ?  '' : s;
					}

					// {{#context_block}} or {{#enumerate_array}} ?
					else if (v && t[2] === '#') {
						out += catchUp();

						// skip loop body?
						if (v.length === 0) {
							self._build(tpl, v[i], pos, t);
						}

						// emit loop body n times, n=1 when type(model.block) is object,
						// n=array.length when type(model.block) is array
						collection = (Object.prototype.toString.call(v) !== '[object Array]') ? [v] : v; 
						pos = self.re.lastIndex;
						for (i = 0; i < collection.length; i++) {
							// model.context_block is an object? pass as context
							out += catchUp() + self._build(tpl, typeof v === 'object' ? 
																collection[i] : context, pos, t);
							if (i < collection.length - 1) {
								self.re.lastIndex = pos;
							}
						}
						pos = self.re.lastIndex;
					}

					// {{^enumerable_array}}
					else if (v && typeof v.length !== undefined && t[2] == '^') {
						out += catchUp();
						pos = self.re.lastIndex;
						s = self._build(tpl, context, pos, t);
						pos = self.re.lastIndex;
						out += v.length ? '' : s;
					}

					else {
						alert('oops');
					}
				}

				t = self.re.exec(tpl);
			}

			if (tag) {
				throw 'Unclosed tag ' + tag[0];
			}

			return out + tpl.slice(pos);
		},

		_modelObserver: function(changes) {
			changes.forEach(function(change) {
				console.log(change.name + " was " + change.type + " and is now " + change.object[change.name]);
			});
		}
	};

	self.html = self._build(tpl.match(/\#\w+/) ? 
		document.getElementById(tpl.substring(1)).innerHTML : tpl, model);
	Object.observe(model, self._modelObserver);

	target = document.getElementById(el.substring(1));
	target._jtmpl = self;
	target.innerHTML = self.html;

	return self;
}
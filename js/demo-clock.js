// Testovací čas (jen testovací prostředí). Načítá se jako první skript, ještě před aplikací.
// Když je v prohlížeči uložený posun, celá aplikace si „myslí“, že je jiný čas – třeba 9:38,
// i když ji zkoušíš večer. Hodiny dál běží. Nastavuje se v panelu Testování.
(function () {
  var KEY = 'zachody-demo-clock';
  var RealDate = window.Date;
  window.__realDate = RealDate;
  var offset = 0;
  try {
    var v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.offset === 'number') offset = v.offset;
  } catch (e) { /* nic */ }
  window.__demoClockOffset = offset;
  if (!offset) return;

  function FakeDate() {
    var a = Array.prototype.slice.call(arguments);
    if (!(this instanceof FakeDate)) return new RealDate(RealDate.now() + offset).toString();
    if (a.length === 0) return new RealDate(RealDate.now() + offset);
    return new (Function.prototype.bind.apply(RealDate, [null].concat(a)))();
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return RealDate.now() + offset; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
})();

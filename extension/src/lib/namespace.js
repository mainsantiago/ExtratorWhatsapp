// Namespace compartilhado entre os scripts de conteúdo (carregados em ordem pelo manifest).
// Também é usado nos testes em Node, onde `globalThis` é o contexto do vm.
(function (g) {
  g.WAX = g.WAX || {};
  g.WAX.VERSION = '1.1.0';
})(globalThis);

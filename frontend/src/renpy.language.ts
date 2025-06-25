export default {
  defaultToken: '',
  tokenPostfix: '.renpy',
  keywords: [
    'label', 'call', 'jump', 'menu', 'if', 'elif', 'else',
    'screen', 'return', 'python', 'init', 'define'
  ],
  tokenizer: {
    root: [
      [/[a-zA-Z_]\w*:/, 'keyword'],          // метки
      [/^(\s*#.*$)/, 'comment']             // комментарии
    ]
  }
};

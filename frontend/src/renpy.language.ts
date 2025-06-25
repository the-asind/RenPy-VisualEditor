export default {
  defaultToken: '',
  tokenPostfix: '.renpy',
  keywords: [
    'label','call','jump','menu','choice','if','elif','else',
    'screen','return','python','init','define','show','hide'
  ],
  tokenizer: {
    root: [
      // метки
      [/^[ \t]*[a-zA-Z_]\w*:/, 'keyword'],
      // комментарии
      [/#.*$/,          'comment'],
      // диалоги  "Mary Hello!"
      [/\"[^"]*\"/,     'string'],
      // имена персонажей перед двоеточием
      [/^[ \t]*[A-Z][A-Za-z_0-9]*[ \t]+\"/, 'type.identifier' ],
      // python-блок
      [/^\s*\$.*$/,     'number'],
    ]
  }
}
// This file defines the language configuration for Ren'Py scripts in a Monaco editor.
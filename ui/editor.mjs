import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {TextStyleKit} from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import {TableKit} from '@tiptap/extension-table';
window.RADAZEditor={mount(element,html,onUpdate){return new Editor({element,content:html||'<p></p>',extensions:[StarterKit.configure({link:false,codeBlock:false,code:false,heading:{levels:[1,2,3]}}),TextStyleKit,TextAlign.configure({types:['heading','paragraph']}),TableKit.configure({table:{resizable:true}})],editorProps:{attributes:{class:'rich-editor pro-document',role:'textbox','aria-label':'Şablon mətni','aria-multiline':'true'}},onUpdate:({editor})=>onUpdate(editor.getHTML(),editor.getText()),onTransaction:({editor})=>window.dispatchEvent(new CustomEvent('radaz-editor-selection',{detail:editor}))});}};

import test from 'node:test';
import assert from 'node:assert/strict';
import {blankPilotInput} from './native.mjs';
test('QA credential entry accepts current/legacy placeholders but never typed identities or password bullets',()=>{
  for(const [label,text] of [['Email',''],['Email','ban@example.com'],['Email','nguyentuan@latlai.vn'],['Mật khẩu',''],['Mật khẩu','Nhập mật khẩu của bạn']]) assert.equal(blankPilotInput(label,text),true);
  for(const [label,text] of [['Email','someone@example.test'],['Mật khẩu','typed-value'],['Mật khẩu','••••'],['Email','Nhập mật khẩu'],['Unknown','']]) assert.equal(blankPilotInput(label,text),false);
});

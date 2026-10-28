const form=document.querySelector('form');
const email=document.querySelector('#email');
const password=document.querySelector('#password');
const reveal=document.querySelector('.reveal');
const notice=document.querySelector('.form-notice');
reveal.addEventListener('click',()=>{
  const visible=password.type==='password';
  password.type=visible?'text':'password';
  reveal.setAttribute('aria-label',visible?'Ẩn mật khẩu':'Hiện mật khẩu');
  reveal.setAttribute('aria-pressed',String(visible));
  const revealLabel=reveal.querySelector('.reveal-label');
  if(revealLabel)revealLabel.textContent=visible?'Ẩn':'Hiện';
  const eyeOpen=reveal.querySelector('[data-eye-open]');
  const eyeClosed=reveal.querySelector('[data-eye-closed]');
  if(eyeOpen&&eyeClosed){eyeOpen.toggleAttribute('hidden',visible);eyeClosed.toggleAttribute('hidden',!visible);}
});
function issue(input,message){
  const error=document.querySelector('#'+input.id+'-error');
  error.textContent=message;error.hidden=!message;
  if(message){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',error.id);}
  else{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');}
}
for(const input of [email,password])input.addEventListener('input',()=>{issue(input,'');notice.hidden=true;});
form.addEventListener('submit',event=>{
  event.preventDefault();
  const emailIssue=!email.value.trim()?'Nhập email để tiếp tục.':!email.validity.valid?'Kiểm tra lại địa chỉ email.':'';
  const passwordIssue=!password.value?'Nhập mật khẩu để tiếp tục.':'';
  issue(email,emailIssue);issue(password,passwordIssue);
  if(emailIssue||passwordIssue){(emailIssue?email:password).focus();return;}
  notice.hidden=false;
  notice.textContent='Đây là bản xem trước giao diện. Chọn “Trang hiện tại” ở trên để đăng nhập hệ thống; form này không gửi thông tin đăng nhập.';
});

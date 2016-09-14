" vim syntax file
" Language: Blackbox Automated Testing
"
if exists("b:current_syntax")
    finish
endif

syn match batCommentLine /^;.*$/
syn match batInputLine /^[a-zA-Z0-9]*>/
syn match batOutputLine /^[a-zA-Z0-9]*</
syn match batType /\/[A-Za-z0-9~_]\{1,10}\(+[A-Za-z0-9~_]\{1,10}\)\{0,1}/
syn match batId /#[A-Za-z0-9~_]\{1,10}\(+[A-Za-z0-9~_]\{1,10}\)\{0,1}/
syn match batStamp /\![A-Za-z0-9~_]\{1,10}\(+[A-Za-z0-9~_]\{1,10}\)\{0,1}/
syn match batName /\.[A-Za-z0-9~_]\{1,10}\(+[A-Za-z0-9~_]\{1,10}\)\{0,1}/

let b:current_syntax = "batt"

" hi def link batCommentLine Comment
hi batCommentLine ctermfg=Grey
hi batMethod ctermfg=DarkYellow
hi batInputLine cterm=bold ctermfg=Yellow
hi batOutputLine cterm=bold ctermfg=Green

hi batType ctermfg=DarkMagenta
hi batId ctermfg=Blue
hi batStamp ctermfg=DarkBlue
hi batName ctermfg=Cyan


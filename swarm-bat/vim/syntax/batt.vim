" vim syntax file
" Language: Blackbox Automated Testing
"
if exists("b:current_syntax")
    finish
endif

syn match batCommentLine /^;.*$/
syn match batInputLine /^\w*>.*$/

let b:current_syntax = "batt"

hi def link batCommentLine Comment
hi def link batInputLine String

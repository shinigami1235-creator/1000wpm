# Copy lint

Finds the sentence shapes Gid rejects in the game's text: dashes, "That is" glosses, "not X, Y" contrasts, a comma before and/or/but/so, reassurance clauses, AI vocabulary and filler adverbs.

    python3 tools/copy/extract.py $(git ls-files 'js/*.js' 'js/**/*.js' | grep -v "words\|wordbank\|passages\|chat-lines\|world-110m") index.html | python3 tools/copy/lint.py

The typing passages and word lists are skipped since they are book text and word lists. A hit is a line to read again. ", so" before an instruction is fine without the comma ("the red ones are fakes so let them land").

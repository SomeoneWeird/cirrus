# cirrus

Cirrus is a CLI tool for managing cloudformation stacks and templates.

(screencasts were done when I had terrible internet, so they're slow)

## Commands

### list

This command lists all the existing non-deleted stacks.

If you pass `--showdeleted` then it will include deleted stacks.

![cirrus list](http://i.imgur.com/hjEufIT.gifv)

### resources

This command lists all resources belonging to a particular stack.

![cirrus resources](http://i.imgur.com/tvy9B73.gifv)

### events

This command lists all events that have happened for a stack.

![cirrus events](http://i.imgur.com/QFY9tgX.gifv)

### account

This command gives you information about your AWS account.

![cirrus accounts](http://i.imgur.com/frB6Ala.gifv)

### estimate

This will give you a URL to an AWS cost estimation page that has your cloudformation resources automatically filled in.

Requires `--file` and `--parameters` args.

This command requires you have a browser installed as it will open the URL with your default application.

### validate

Validates a template + parameter file.

Requires `--file` and `--parameters`.

Pass: ![cirrus validate pass](http://imgur.com/B2jiI1l.gifv)
Fail: ![cirrus validate fail](http://imgur.com/XI987YI.gifv)

### create

Creates a new template.

Requires a stack name, `--file`, and `--parameters`.

![cirrus create](http://i.imgur.com/FZyIuIG.gifv)

### update

Updates an existing template.

Requires a stack name, `--file`, and `--parameters`.

### delete

Deletes an existing stack.

Will prompt for confirmation.

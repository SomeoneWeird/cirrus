# cirrus

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Cirrus is a CLI tool for managing cloudformation stacks and templates.

(screencasts were done when I had terrible internet, so they're slow)

## CF Parameters

### Interpolation

Parameter values can be interpolated from existing cloudformation stacks.

Instead of having:

```js
[
  {
    ParameterKey: "PublicSubnet1",
    ParameterValue: "subnet-123456"
  }
]
```

you could change it to

```js
[
  {
    ParameterKey: "PublicSubnet1",
    ParameterValue: "<<mainVPC.PublicSubnet1>>"
  }
]
```

Where `mainVPC` is the name of another stack, and `PublicSubnet1` is the resource name.
The value will be replaced with the ID of the resource you specify.

### Prompting

You can prompt for a value when you run `create` or `update`.

```js
[
  {
    ParameterKey: "SecretParameter",
    ParameterValue: "<<prompt>>"
  }
]
```

## Commands

### list

This command lists all the existing non-deleted stacks.

If you pass `--showdeleted` then it will include deleted stacks.

![cirrus list](http://i.imgur.com/hjEufIT.gif)

### resources

This command lists all resources belonging to a particular stack.

![cirrus resources](http://i.imgur.com/tvy9B73.gif)

### events

This command lists all events that have happened for a stack.

![cirrus events](http://i.imgur.com/QFY9tgX.gif)

### account

This command gives you information about your AWS account.

![cirrus accounts](http://i.imgur.com/frB6Ala.gif)

### estimate

This will give you a URL to an AWS cost estimation page that has your cloudformation resources automatically filled in.

Requires `--file` and `--parameters` args.

This command requires you have a browser installed as it will open the URL with your default application.

### validate

Validates a template + parameter file.

Requires `--file` and `--parameters`.

Pass: ![cirrus validate pass](http://imgur.com/B2jiI1l.gif)

Fail: ![cirrus validate fail](http://imgur.com/XI987YI.gif)

### create

Creates a new template.

Requires a stack name, `--file`, and `--parameters`.

![cirrus create](http://i.imgur.com/FZyIuIG.gif)

### update

Updates an existing template.

Requires a stack name, `--file`, and `--parameters`.

### delete

Deletes an existing stack.

Will prompt for confirmation.

### diff

Note: This command is a WIP and the output will almost definitely change.

Displays information about what will change if you apply this template to an existing stack.

[![asciicast](https://asciinema.org/a/1e00t3mbz4t2idozscphnqtww.png)](https://asciinema.org/a/1e00t3mbz4t2idozscphnqtww)

# JSON Rich Text format

Used for exchange between Weave and DOM.
Encodes HTML-like rich text, all CSS formatting options supported.
Example:

    [   "Regular string, then ",
        {"font-weight:":"bold"},
        "some bold",
        {"font-weight:":""}, 
        "then plain text again."  ]

Text structure (paragraphs, table cells, lists) are conveyed by
newlines and tabulations:

    \n Paragraph
    \n Another paragraph
    \n\t list item or indented block
    \n table \t cells

Formatting is conveyed by attribute-value pairs applied to text
ranges. There is no nesting; intervals may overlap. Before each
newline, all the effective formatting attributes are listed in one
object.  Before every formatting change, the new value is given for
every affected attribute:

    [
        {"color:": "red", "head>": "1"},
        "\nBig red header, one ",
        {"color:": "blue"},
        "blue",
        {"color:": "red"},
        " word."
    ]
    
    // HTML: <H1><span style="color: red">Big red header, one 
                 </span><span style="color: blue">blue</span>
                 <span style="color: red"> word</span></H1>

RTF formatting attributes are mapped to HTML tag names, attributes,
class names and CSS styles. Those types are distinguished by the key's
postfix:

    {
        "head>" :        "1",                  // line is <H1>
        "href=" :        "http://google.com",  // HTML attribute
        "font-weight:" : "bold",               // CSS attribute
        "hili_" :        "on"                  // HTML class="hili_on"
    }
    //                                         @gritzko 6Mar14 MSK

## Nesting and structurals

    <p>line</p>
    <ul>
        <li>one</li>
        <li>two
            <ol>
                <li>nested</li>
                <li>.</li>
            </ol>
        </li>
    </ul>
    <table>
        <tr><td>cell A1</td><td>cell A2</td></tr>
        <tr><td>B1</td><td>B2</td></tr>
    </table>

    \nline
    \n\tone
    \n\ttwo
    \n\t\tnested
    \n\t\t.
    \n\tcell A1\tcellA2
    \n\tB1\tB2

    line
        one
        two
            nested
            .
        cell A1     cell A2
        B1          B2


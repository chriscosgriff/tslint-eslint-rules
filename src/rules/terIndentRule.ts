/**
 * This rule is a port of eslint:
 *
 * source file: https://github.com/eslint/eslint/blob/master/lib/rules/indent.js
 * git commit hash: 0643bfeff68979044ca57a2b392d855d18be7d08
 *
 */
import * as ts from 'typescript';
import * as Lint from 'tslint';

const RULE_NAME = 'ter-indent';
const DEFAULT_VARIABLE_INDENT = 1;
const DEFAULT_PARAMETER_INDENT = null;
const DEFAULT_FUNCTION_BODY_INDENT = 1;
let indentType = 'space';
let indentSize = 4;
let OPTIONS: any;

function assign(target: any, ...sources: any[]): any {
  sources.forEach((source) => {
    if (source !== undefined && source !== null) {
      for (const nextKey in source) {
        if (source.hasOwnProperty(nextKey)) {
          target[nextKey] = source[nextKey];
        }
      }
    }
  });
  return target;
}

function isKind(node: ts.Node, kind: string) {
  return node.kind === ts.SyntaxKind[kind];
}

function isOneOf(node: ts.Node, kinds: string[]) {
  return kinds.some(kind => node.kind === ts.SyntaxKind[kind]);
}

export class Rule extends Lint.Rules.AbstractRule {
  public static metadata: Lint.IRuleMetadata = {
    ruleName: RULE_NAME,
    description: 'enforce consistent indentation',
    rationale: Lint.Utils.dedent`
      Using only one of tabs or spaces for indentation leads to more consistent editor behavior,
      cleaner diffs in version control, and easier programmatic manipulation.
      `,
    optionsDescription: Lint.Utils.dedent`
      The string 'tab' or an integer indicating the number of spaces to use per tab.

      An object may be provided to fine tune the indentation rules:
            
        * \`"SwitchCase"\` (default: 0) enforces indentation level for \`case\` clauses in
                           \`switch\` statements
        * \`"VariableDeclarator"\` (default: 1) enforces indentation level for \`var\` declarators;
                                   can also take an object to define separate rules for \`var\`,
                                   \`let\` and \`const\` declarations.
        * \`"outerIIFEBody"\` (default: 1) enforces indentation level for file-level IIFEs.
        * \`"MemberExpression"\` (off by default) enforces indentation level for multi-line
                                 property chains (except in variable declarations and assignments)
        * \`"FunctionDeclaration"\` takes an object to define rules for function declarations.
            * \`"parameters"\` (off by default) enforces indentation level for parameters in a
                               function declaration. This can either be a number indicating
                               indentation level, or the string \`"first"\` indicating that all
                               parameters of the declaration must be aligned with the first parameter.
            * \`"body"\` (default: 1) enforces indentation level for the body of a function expression.
        * \`"FunctionExpression"\` takes an object to define rules for function declarations.
            * \`"parameters"\` (off by default) enforces indentation level for parameters in a
                               function declaration. This can either be a number indicating
                               indentation level, or the string \`"first"\` indicating that all
                               parameters of the declaration must be aligned with the first parameter.
            * \`"body"\` (default: 1) enforces indentation level for the body of a function expression.
        * \`"CallExpression"\` takes an object to define rules for function call expressions.
            * \`"arguments"\` (off by default) enforces indentation level for arguments in a call
                              expression. This can either be a number indicating indentation level,
                              or the string \`"first"\` indicating that all arguments of the
                              expression must be aligned with the first argument.
      `,
    options: {
      type: 'array',
      items: [{
        type: 'number',
        minimum: '0'
      }, {
        type: 'string',
        enum: ['tab']
      }, {
        type: 'object',
        properties: {
          SwitchCase: {
            type: 'number',
            minimum: 0
          },
          VariableDeclarator: {
            type: 'object',
            properties: {
              var: {
                type: 'number',
                minimum: 0
              },
              let: {
                type: 'number',
                minimum: 0
              },
              const: {
                type: 'number',
                minimum: 0
              }
            }
          },
          outerIIFEBody: {
            type: 'number'
          },
          FunctionDeclaration: {
            type: 'object',
            properties: {
              parameters: {
                type: 'number',
                minimum: 0
              },
              body: {
                type: 'number',
                minimum: 0
              }
            }
          },
          FunctionExpression: {
            type: 'object',
            properties: {
              parameters: {
                type: 'number',
                minimum: 0
              },
              body: {
                type: 'number',
                minimum: 0
              }
            }
          },
          MemberExpression: {
            type: 'number'
          },
          CallExpression: {
            type: 'object',
            properties: {
              arguments: {
                type: 'number',
                minimum: 0
              }
            }
          }
        },
        additionalProperties: false
      }],
      minLength: 1,
      maxLength: 2
    },
    optionExamples: [
      Lint.Utils.dedent`
        "${RULE_NAME}": [true, "tab"]
        `,
      Lint.Utils.dedent`
        "${RULE_NAME}": [true, 2]
        `,
      Lint.Utils.dedent`
        "${RULE_NAME}": [
          true,
          2,
          {
            "FunctionExpression": {
              "parameters": 1,
              "body": 1
            }
          }
        ]      
        `
    ],
    typescriptOnly: false,
    type: 'maintainability'
  };

  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    const walker = new IndentWalker(sourceFile, this.getOptions());
    return this.applyWithWalker(walker);
  }
}

class IndentWalker extends Lint.RuleWalker {
  private srcFile: ts.SourceFile;
  private srcText: string;
  private caseIndentStore: { [key: number]: number } = {};
  private varIndentStore: { [key: number]: number } = {};

  constructor(sourceFile: ts.SourceFile, options: Lint.IOptions) {
    super(sourceFile, options);
    OPTIONS = {
      SwitchCase: 0,
      VariableDeclarator: {
        var: DEFAULT_VARIABLE_INDENT,
        let: DEFAULT_VARIABLE_INDENT,
        const: DEFAULT_VARIABLE_INDENT
      },
      outerIIFEBody: null,
      FunctionDeclaration: {
        parameters: DEFAULT_PARAMETER_INDENT,
        body: DEFAULT_FUNCTION_BODY_INDENT
      },
      FunctionExpression: {
        parameters: DEFAULT_PARAMETER_INDENT,
        body: DEFAULT_FUNCTION_BODY_INDENT
      },
      CallExpression: {
        arguments: DEFAULT_PARAMETER_INDENT
      }
    };
    const firstParam = this.getOptions()[0];
    if (firstParam === 'tab') {
      indentSize = 1;
      indentType = 'tab';
    } else {
      indentSize = firstParam || 4;
      indentType = 'space';
    }
    const userOptions = this.getOptions()[1];
    if (userOptions) {
      OPTIONS.SwitchCase = userOptions.SwitchCase || 0;

      if (typeof userOptions.VariableDeclarator === 'number') {
        OPTIONS.VariableDeclarator = {
          var: userOptions.VariableDeclarator,
          let: userOptions.VariableDeclarator,
          const: userOptions.VariableDeclarator
        };
      } else if (typeof userOptions.VariableDeclarator === 'object') {
        assign(OPTIONS.VariableDeclarator, userOptions.VariableDeclarator);
      }

      if (typeof userOptions.outerIIFEBody === 'number') {
        OPTIONS.outerIIFEBody = userOptions.outerIIFEBody;
      }

      if (typeof userOptions.MemberExpression === 'number') {
        OPTIONS.MemberExpression = userOptions.MemberExpression;
      }

      if (typeof userOptions.FunctionDeclaration === 'object') {
        assign(OPTIONS.FunctionDeclaration, userOptions.FunctionDeclaration);
      }

      if (typeof userOptions.FunctionExpression === 'object') {
        assign(OPTIONS.FunctionExpression, userOptions.FunctionExpression);
      }

      if (typeof userOptions.CallExpression === 'object') {
        assign(OPTIONS.CallExpression, userOptions.CallExpression);
      }

    }
    this.srcFile = sourceFile;
    this.srcText = sourceFile.getFullText();
  }

  private getSourceSubstr(start: number, end: number) {
    return this.srcText.substr(start, end - start);
  }

  private getLineAndCharacter(node: ts.Node, byEndLocation: boolean = false) {
    const index = byEndLocation ? node.getEnd() : node.getStart();
    return this.srcFile.getLineAndCharacterOfPosition(index);
  }

  private getLine(node: ts.Node, byEndLocation: boolean = false) {
    return this.getLineAndCharacter(node, byEndLocation).line;
  }

  /**
   * Creates an error message for a line.
   *
   * expectedAmount: The expected amount of indentation characters for this line
   * actualSpaces: The actual number of indentation spaces that were found on this line
   * actualTabs: The actual number of indentation tabs that were found on this line
   */
  private createErrorMessage(expectedAmount, actualSpaces, actualTabs) {
    const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? '' : 's'}`;
    const foundSpacesWord = `space${actualSpaces === 1 ? '' : 's'}`;
    const foundTabsWord = `tab${actualTabs === 1 ? '' : 's'}`;
    let foundStatement;

    if (actualSpaces > 0 && actualTabs > 0) {
      foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
    } else if (actualSpaces > 0) {
      // Abbreviate the message if the expected indentation is also spaces.
      // e.g. 'Expected 4 spaces but found 2' rather than 'Expected 4 spaces but found 2 spaces'
      foundStatement = indentType === 'space' ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
    } else if (actualTabs > 0) {
      foundStatement = indentType === 'tab' ? actualTabs : `${actualTabs} ${foundTabsWord}`;
    } else {
      foundStatement = '0';
    }

    return `Expected indentation of ${expectedStatement} but found ${foundStatement}.`;
  }

  /**
   * Reports a given indent violation
   * node: Node violating the indent rule
   * needed: Expected indentation character count
   * gottenSpaces: Indentation space count in the actual node/code
   * gottenTabs: Indentation tab count in the actual node/code
   */
  private report(node: ts.Node, needed, gottenSpaces, gottenTabs, loc?) {
    if (gottenSpaces && gottenTabs) {
      // Don't report lines that have both spaces and tabs to avoid conflicts with rules that
      // report a mix of tabs and spaces.
      return;
    }
    const msg = this.createErrorMessage(needed, gottenSpaces, gottenTabs);
    const width = gottenSpaces + gottenTabs;
    this.addFailure(this.createFailure((loc !== undefined ? loc : node.getStart()) - width, width, msg));
  }

  /**
   * Checks node is the first in its own start line. By default it looks by start line.
   * [byEndLocation=false]: Lookup based on start position or end
   */
  private isNodeFirstInLine(node: ts.Node, byEndLocation: boolean = false) {
    const token = byEndLocation ? node.getLastToken() : node.getFirstToken();
    let pos = token.getStart() - 1;
    while ([' ', '\t'].indexOf(this.srcText.charAt(pos)) !== -1) {
      pos -= 1;
    }
    return this.srcText.charAt(pos) === '\n' || this._firstInLineCommentHelper(node);
  }

  /**
   * Checks to see a leading comment is blocking the start of the node. For instance:
   *
   *    /* comment *\/ {
   *
   * is allowed and in this case `{` would be first in line.
   */
  private _firstInLineCommentHelper(node: ts.Node) {
    let pos;
    let firstInLine = false;
    const comments = ts.getLeadingCommentRanges(node.getFullText(), 0);
    if (comments && comments.length) {
      const offset = node.getFullStart();
      const lastComment = comments[comments.length - 1];
      const comment = this.getSourceSubstr(lastComment.pos + offset, lastComment.end + offset);
      if (comment.indexOf('\n') !== -1) {
        firstInLine = true;
      } else {
        pos = lastComment.pos + offset;
        while (pos > 0 && this.srcText.charAt(pos) !== '\n') {
          pos -= 1;
        }
        const content = this.getSourceSubstr(pos + 1, lastComment.pos + offset);
        if (content.trim() === '') {
          firstInLine = true;
        }
      }
    }

    return firstInLine;
  }

  /**
   * Returns the node's indent. Contains keys `space` and `tab`, representing the indent of each
   * character. Also contains keys `goodChar` and `badChar`, where `goodChar` is the amount of the
   * user's desired indentation character, and `badChar` is the amount of the other indentation
   * character.
   */
  private getNodeIndent(node: ts.Node) {
    if (node === this.getSourceFile()) {
      return { space: 0, tab: 0, goodChar: 0, badChar: 0 };
    }
    if (node.kind === ts.SyntaxKind.SyntaxList) {
      return this.getNodeIndent(node.parent);
    }

    const endIndex = node.getStart();
    let pos = endIndex - 1;
    while (pos > 0 && this.srcText.charAt(pos) !== '\n') {
      pos -= 1;
    }
    const str = this.getSourceSubstr(pos + 1, endIndex);
    const whiteSpace = (str.match(/^\s+/) || [''])[0];
    const indentChars = whiteSpace.split('');
    const spaces = indentChars.filter(char => char === ' ').length;
    const tabs = indentChars.filter(char => char === '\t').length;

    return {
      firstInLine: spaces + tabs === str.length || this._firstInLineCommentHelper(node),
      space: spaces,
      tab: tabs,
      goodChar: indentType === 'space' ? spaces : tabs,
      badChar: indentType === 'space' ? tabs : spaces
    };
  }

  private checkNodeIndent(node: ts.Node, neededIndent: number) {
    const actualIndent = this.getNodeIndent(node);
    if (
      !isKind(node, 'ArrayLiteralExpression') &&
      !isKind(node, 'ObjectLiteralExpression') &&
      (actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
      actualIndent.firstInLine
    ) {
      this.report(node, neededIndent, actualIndent.space, actualIndent.tab);
    }

    if (isKind(node, 'IfStatement')) {
      const elseStatement = (node as ts.IfStatement).elseStatement;
      if (elseStatement) {
        const elseKeyword = node.getChildren().filter(ch => isKind(ch, 'ElseKeyword')).shift();
        this.checkNodeIndent(elseKeyword, neededIndent);
        if (!this.isNodeFirstInLine(elseStatement)) {
          this.checkNodeIndent(elseStatement, neededIndent);
        }
      }
    } else if (isKind(node, 'TryStatement')) {
      const handler = (node as ts.TryStatement).catchClause;
      if (handler) {
        const catchKeyword = handler.getChildren().filter(ch => isKind(ch, 'CatchKeyword')).shift();
        this.checkNodeIndent(catchKeyword, neededIndent);
        if (!this.isNodeFirstInLine(handler)) {
          this.checkNodeIndent(handler, neededIndent);
        }
      }

      const finalizer = (node as ts.TryStatement).finallyBlock;
      if (finalizer) {
        const finallyKeyword = node.getChildren().filter(ch => isKind(ch, 'FinallyKeyword')).shift();
        this.checkNodeIndent(finallyKeyword, neededIndent);
      }
    } else if (isKind(node, 'DoStatement')) {
      const whileKeyword = node.getChildren().filter(ch => isKind(ch, 'WhileKeyword')).shift();
      this.checkNodeIndent(whileKeyword, neededIndent);
    }
  }

  private isSingleLineNode(node): boolean {
    // Note: all the tests would pass using `node.getFullText()` but we should only use this for
    // the syntax list nodes, otherwise nodes which are single line may say they are multiline
    // and this will make us do unnecessary checks.
    const text = node.kind === ts.SyntaxKind.SyntaxList ? node.getFullText() : node.getText();
    return text.indexOf('\n') === -1;
  }

  /**
   * Check indentation for blocks
   */
  private blockIndentationCheck(node: ts.Node): void {
    if (this.isSingleLineNode(node)) {
      return;
    }

    const functionLike = [
      'FunctionExpression',
      'FunctionDeclaration',
      'MethodDeclaration',
      'Constructor',
      'ArrowFunction'
    ];
    if (node.parent && isOneOf(node.parent, functionLike)) {
      this.checkIndentInFunctionBlock(node);
      return;
    }

    let indent;
    let nodesToCheck = [];

    /* For these statements we should check indent from statement beginning, not from the beginning
       of the block.
     */
    const statementsWithProperties = [
      'IfStatement',
      'WhileStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'DoStatement',
      'ClassDeclaration',
      'ClassExpression',
      'TryStatement',
      'SourceFile'
    ];
    if (node.parent && isOneOf(node.parent, statementsWithProperties) && this.isNodeBodyBlock(node)) {
      indent = this.getNodeIndent(node.parent).goodChar;
    } else if (node.parent && isKind(node.parent, 'CatchClause')) {
      indent = this.getNodeIndent(node.parent.parent).goodChar;
    } else {
      indent = this.getNodeIndent(node).goodChar;
    }

    if (isKind(node, 'IfStatement') && !isKind(node['thenStatement'], 'Block')) {
      nodesToCheck = [node['thenStatement']];
    } else {
      if (node.kind === ts.SyntaxKind.Block) {
        nodesToCheck = node.getChildren()[1].getChildren();
      } else if (isOneOf(node.parent, ['ClassDeclaration', 'ClassExpression'])) {
        nodesToCheck = node.getChildren();
      } else {
        nodesToCheck = [(node as ts.IterationStatement).statement];
      }
    }
    this.checkNodeIndent(node, indent);

    if (nodesToCheck.length > 0) {
      this.checkNodesIndent(nodesToCheck, indent + indentSize);
    }

    if (isKind(node, 'Block')) {
      this.checkLastNodeLineIndent(node, indent);
    }
  }

  private isClassLike(node) {
    return isOneOf(node, ['ClassDeclaration', 'ClassExpression']);
  }

  /**
   * Check if node is an assignment expression, i.e. the binary expression contains the equal token.
   */
  private isAssignment(node: ts.Node): boolean {
    if (!isKind(node, 'BinaryExpression')) {
      return false;
    }
    return (node as ts.BinaryExpression).operatorToken.getText() === '=';
  }

  /**
   * Check if the node or node body is a BlockStatement or not
   */
  private isNodeBodyBlock(node): boolean {
    return node.kind === ts.SyntaxKind.Block ||
      (node.kind === ts.SyntaxKind.SyntaxList && this.isClassLike(node.parent.kind));
    // return node.type === "BlockStatement" || node.type === "ClassBody" || (node.body && node.body.type === "BlockStatement") ||
    //   (node.consequent && node.consequent.type === "BlockStatement");
  }

  /**
   * Check that the start of the node has the correct level of indentation.
   */
  private checkFirstNodeLineIndent(node, firstLineIndent): void {
    const startIndent = this.getNodeIndent(node);
    const firstInLine = startIndent.firstInLine;
    if (firstInLine && (startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0)) {
      this.report(node, firstLineIndent, startIndent.space, startIndent.tab);
    }
  }

  /**
   * Check last line of the node has the correct level of indentation.
   */
  private checkLastNodeLineIndent(node, lastLineIndent) {
    const lastToken = node.getLastToken();
    const endIndent = this.getNodeIndent(lastToken);
    const firstInLine = endIndent.firstInLine;
    if (firstInLine && (endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0)) {
      this.report(lastToken, lastLineIndent, endIndent.space, endIndent.tab);
    }
  }

  /**
   * Check to see if the node function is a file level IIFE
   */
  private isOuterIIFE(node): boolean {
    let parent = node.parent;
    let expressionIsNode = parent.expression !== node;
    if (isKind(parent, 'ParenthesizedExpression')) {
      parent = parent.parent;
    }
    let stmt = parent.parent;

    // Verify that the node is an IIEF
    if (!isKind(parent, 'CallExpression') || expressionIsNode) {
      return false;
    }

    // Navigate legal ancestors to determine whether this IIEF is outer
    while (
      isKind(stmt, 'PrefixUnaryExpression') && (
        stmt.operator === ts.SyntaxKind.ExclamationToken ||
        stmt.operator === ts.SyntaxKind.TildeToken ||
        stmt.operator === ts.SyntaxKind.PlusToken ||
        stmt.operator === ts.SyntaxKind.MinusToken
      ) ||
      isKind(stmt, 'BinaryExpression') ||
      isKind(stmt, 'SyntaxList') ||
      isKind(stmt, 'VariableDeclaration') ||
      isKind(stmt, 'VariableDeclarationList') ||
      isKind(stmt, 'ParenthesizedExpression')
    ) {
      stmt = stmt.parent;
    }

    return ((
      isKind(stmt, 'ExpressionStatement') ||
      isKind(stmt, 'VariableStatement')) &&
      stmt.parent && isKind(stmt.parent, 'SourceFile')
    );
  }

  /**
   * Check to see if the argument before the callee node is multi-line and
   * there should only be 1 argument before the callee node
   */
  private isArgBeforeCalleeNodeMultiline(node: ts.Node): boolean {
    const parent = node.parent;
    if (parent['arguments'].length >= 2 && parent['arguments'][1] === node) {
      const firstArg = parent['arguments'][0];
      return this.getLine(firstArg, true) > this.getLine(firstArg);
    }

    return false;
  }

  /**
   * Check indent for function block content
   */
  private checkIndentInFunctionBlock(node): void {
    const calleeNode = node.parent; // FunctionExpression
    let indent = this.getNodeIndent(calleeNode).goodChar;

    if (calleeNode.parent.kind === ts.SyntaxKind.CallExpression) {
      const calleeParent = calleeNode.parent;

      if (calleeNode.kind !== ts.SyntaxKind.FunctionExpression && calleeNode.kind !== ts.SyntaxKind.ArrowFunction) {
        if (calleeParent && this.getLine(calleeParent) < this.getLine(node)) {
          indent = this.getNodeIndent(calleeParent).goodChar;
        }
      } else {
        const callee = calleeParent.expression;
        if (
          this.isArgBeforeCalleeNodeMultiline(calleeNode) &&
          this.getLine(callee) === this.getLine(callee, true) &&
          !this.isNodeFirstInLine(calleeNode)
        ) {
          indent = this.getNodeIndent(calleeParent).goodChar;
        }
      }
    }
    // function body indent should be indent + indent size, unless this
    // is a FunctionDeclaration, FunctionExpression, or outer IIFE and the corresponding options are enabled.
    let functionOffset = indentSize;
    if (OPTIONS.outerIIFEBody !== null && this.isOuterIIFE(calleeNode)) {
      functionOffset = OPTIONS.outerIIFEBody * indentSize;
    } else if (calleeNode.kind === ts.SyntaxKind.FunctionExpression) {
      functionOffset = OPTIONS.FunctionExpression.body * indentSize;
    } else if (calleeNode.kind === ts.SyntaxKind.FunctionDeclaration) {
      functionOffset = OPTIONS.FunctionDeclaration.body * indentSize;
    } else if (isOneOf(calleeNode, ['MethodDeclaration', 'Constructor'])) {
      functionOffset = OPTIONS.FunctionExpression.body * indentSize;
    }
    indent += functionOffset;

    // check if the node is inside a variable
    const parentVarNode = this.getVariableDeclaratorNode(node);

    if (parentVarNode && this.isNodeInVarOnTop(node, parentVarNode)) {
      const varKind = parentVarNode.parent.getFirstToken().getText();
      indent += indentSize * OPTIONS.VariableDeclarator[varKind];
    }

    this.checkFirstNodeLineIndent(node, indent - functionOffset);

    if (node.statements.length) {
      this.checkNodesIndent(node.statements, indent);
    }

    this.checkLastNodeLineIndent(node, indent - functionOffset);
  }

  /**
   * Check indent for nodes list.
   */
  protected checkNodesIndent(nodes: ts.Node[], indent: number): void {
    nodes.forEach(node => this.checkNodeIndent(node, indent));
  }

  /**
   * Returns the expected indentation for the case statement.
   */
  private expectedCaseIndent(node: ts.Node, switchIndent?: number) {
    const switchNode = (node.kind === ts.SyntaxKind.SwitchStatement) ? node : node.parent;
    const line = this.getLine(switchNode);
    let caseIndent;

    if (this.caseIndentStore[line]) {
      return this.caseIndentStore[line];
    } else {
      if (typeof switchIndent === 'undefined') {
        switchIndent = this.getNodeIndent(switchNode).goodChar;
      }

      caseIndent = switchIndent + (indentSize * OPTIONS.SwitchCase);
      this.caseIndentStore[line] = caseIndent;
      return caseIndent;
    }
  }

  /**
   * Returns the expected indentation for the variable declarations.
   */
  private expectedVarIndent(node: ts.VariableDeclaration, varIndent?: number) {
    // VariableStatement -> VariableDeclarationList -> VariableDeclaration
    const varNode = node.parent;
    const line = this.getLine(varNode);
    let indent;

    if (this.varIndentStore[line]) {
      return this.varIndentStore[line];
    } else {
      if (typeof varIndent === 'undefined') {
        varIndent = this.getNodeIndent(varNode).goodChar;
      }
      const varKind = varNode.getFirstToken().getText();
      indent = varIndent + (indentSize * OPTIONS.VariableDeclarator[varKind]);
      this.varIndentStore[line] = indent;
      return indent;
    }
  }

  /**
   * Returns a parent node of given node based on a specified type
   * if not present then return null
   */
  private getParentNodeByType<T extends ts.Node>(
    node: ts.Node,
    kind: number,
    stopAtList: number[] = [ts.SyntaxKind.SourceFile]
  ): T {
    let parent = node.parent;

    while (
      parent.kind !== kind
      && stopAtList.indexOf(parent.kind) === -1
      && parent.kind !== ts.SyntaxKind.SourceFile
    ) {
      parent = parent.parent;
    }

    return parent.kind === kind ? parent as T : null;
  }

  /**
   * Returns the VariableDeclarator based on the current node if not present then return null.
   */
  protected getVariableDeclaratorNode(node: ts.Node): ts.VariableDeclaration {
    return this.getParentNodeByType<ts.VariableDeclaration>(node, ts.SyntaxKind.VariableDeclaration);
  }

  /**
   * Returns the BinaryExpression based on the current node if not present then return null.
   */
  protected getBinaryExpressionNode(node: ts.Node): ts.BinaryExpression {
    return this.getParentNodeByType<ts.BinaryExpression>(node, ts.SyntaxKind.BinaryExpression);
  }

  /**
   * Check indent for array block content or object block content
   */
  protected checkIndentInArrayOrObjectBlock(node: ts.Node): void {
    if (this.isSingleLineNode(node)) {
      return;
    }

    let elements = isKind(node, 'ObjectLiteralExpression') ? node['properties'] : node['elements'];

    // filter out empty elements, an example would be [ , 2]
    elements = elements.filter(elem => elem.getText() !== '');

    const nodeLine = this.getLine(node);
    const nodeEndLine = this.getLine(node, true);

    let nodeIndent;
    let elementsIndent;
    let varKind;
    const parentVarNode = this.getVariableDeclaratorNode(node);

    if (this.isNodeFirstInLine(node)) {
      const parent = node.parent;

      nodeIndent = this.getNodeIndent(parent).goodChar;
      if (parentVarNode && this.getLine(parentVarNode) !== nodeLine) {
        if (!isKind(parent, 'VariableDeclaration') || parentVarNode === parentVarNode.parent.declarations[0]) {
          const parentVarLine = this.getLine(parentVarNode);
          const parentLine = this.getLine(parent);
          if (isKind(parent, 'VariableDeclaration') && parentVarLine === parentLine) {
            varKind = parentVarNode.parent.getFirstToken().getText();
            nodeIndent = nodeIndent + (indentSize * OPTIONS.VariableDeclarator[varKind]);
          } else if (
            isOneOf(parent, [
              'ObjectLiteralExpression',
              'ArrayLiteralExpression',
              'CallExpression',
              'ArrowFunction',
              'NewExpression',
              'BinaryExpression'
            ])
          ) {
            nodeIndent = nodeIndent + indentSize;
          }
        }
      } else if (
        !parentVarNode &&
        !this.isFirstArrayElementOnSameLine(parent) &&
        parent.kind !== ts.SyntaxKind.PropertyAccessExpression &&
        parent.kind !== ts.SyntaxKind.ExpressionStatement &&
        parent.kind !== ts.SyntaxKind.PropertyAssignment &&
        !(this.isAssignment(parent))
      ) {
        nodeIndent = nodeIndent + indentSize;
      }

      elementsIndent = nodeIndent + indentSize;
      this.checkFirstNodeLineIndent(node, nodeIndent);
    } else {
      nodeIndent = this.getNodeIndent(node).goodChar;
      elementsIndent = nodeIndent + indentSize;
    }

    /*
       * Check if the node is a multiple variable declaration; if so, then
       * make sure indentation takes that into account.
       */
    if (parentVarNode && this.isNodeInVarOnTop(node, parentVarNode)) {
      varKind = parentVarNode.parent.getFirstToken().getText();
      elementsIndent += indentSize * OPTIONS.VariableDeclarator[varKind];
    }

    this.checkNodesIndent(elements, elementsIndent);

    if (elements.length > 0) {
      const lastLine = this.getLine(elements[elements.length - 1], true);
      // Skip last block line check if last item in same line
      if (lastLine === nodeEndLine) {
        return;
      }
    }

    this.checkLastNodeLineIndent(node, elementsIndent - indentSize);
  }

  /**
   * Check to see if the first element inside an array is an object and on the same line as the node
   */
  private isFirstArrayElementOnSameLine(node: ts.Node): boolean {
    if (isKind(node, 'ArrayLiteralExpression')) {
      const ele = (node as ts.ArrayLiteralExpression).elements[0];
      if (ele) {
        return isKind(ele, 'ObjectLiteralExpression') && this.getLine(ele) === this.getLine(node);
      }
    }
    return false;
  }

  /**
   * Check to see if the node is part of the multi-line variable declaration.
   * Also if its on the same line as the varNode
   * @param {ASTNode} node node to check
   * @param {ASTNode} varNode variable declaration node to check against
   * @returns {boolean} True if all the above condition satisfy
   */
  protected isNodeInVarOnTop(node: ts.Node, varNode) {
    const nodeLine = this.getLine(node);
    const parentLine = this.getLine(varNode.parent);
    return varNode &&
      parentLine === nodeLine &&
      varNode.parent.declarations.length > 1;
  }

  /**
   * Check and decide whether to check for indentation for blockless nodes
   * Scenarios are for or while statements without braces around them
   */
  private blockLessNodes(node) {
    if (!isKind(node.statement, 'Block')) {
      this.blockIndentationCheck(node);
    }
  }

  /**
   * Check indentation for variable declarations
   */
  private checkIndentInVariableDeclarations(node: ts.VariableDeclaration) {
    const indent = this.expectedVarIndent(node);
    this.checkNodeIndent(node, indent);
  }

  /**
   * Check indentation for case and default clauses in switch statements.
   */
  private visitCase(node: ts.CaseClause | ts.DefaultClause) {
    if (this.isSingleLineNode(node)) {
      return;
    }
    const caseIndent = this.expectedCaseIndent(node);
    this.checkNodesIndent(node.statements, caseIndent + indentSize);
  }

  /**
   * Check last node line indent this detects, that block closed correctly
   * This function for more complicated return statement case, where closing parenthesis may be
   * followed by ';'
   */
  private checkLastReturnStatementLineIndent(node: ts.ReturnStatement, firstLineIndent) {
    const lastToken = node.expression.getLastToken();

    const endIndex = lastToken.getStart();
    let pos = endIndex - 1;
    while (pos > 0 && this.srcText.charAt(pos) !== '\n') {
      pos -= 1;
    }
    const textBeforeClosingParenthesis = this.getSourceSubstr(pos + 1, endIndex);
    if (textBeforeClosingParenthesis.trim()) {
      // There are tokens before the closing paren, don't report this case
      return;
    }

    const endIndent = this.getNodeIndent(lastToken);
    if (endIndent.goodChar !== firstLineIndent) {
      this.report(node, firstLineIndent, endIndent.space, endIndent.tab, lastToken.getStart());
    }
  }

  protected visitClassDeclaration(node: ts.ClassDeclaration) {
    const len = node.getChildCount();
    this.blockIndentationCheck(node.getChildAt(len - 2));
    super.visitClassDeclaration(node);
  }

  protected visitClassExpression(node: ts.ClassExpression) {
    const len = node.getChildCount();
    this.blockIndentationCheck(node.getChildAt(len - 2));
    super.visitClassExpression(node);
  }

  protected visitBlock(node: ts.Block) {
    this.blockIndentationCheck(node);
    super.visitBlock(node);
  }

  protected visitIfStatement(node: ts.IfStatement) {
    const thenLine = this.getLine(node.thenStatement);
    const line = this.getLine(node);
    if (node.thenStatement.kind !== ts.SyntaxKind.Block && thenLine > line) {
      this.blockIndentationCheck(node);
    }
    super.visitIfStatement(node);
  }

  protected visitObjectLiteralExpression(node: ts.ObjectLiteralExpression) {
    this.checkIndentInArrayOrObjectBlock(node);
    super.visitObjectLiteralExpression(node);
  }

  protected visitArrayLiteralExpression(node: ts.ArrayLiteralExpression) {
    this.checkIndentInArrayOrObjectBlock(node);
    super.visitArrayLiteralExpression(node);
  }

  protected visitSwitchStatement(node: ts.SwitchStatement) {
    const switchIndent = this.getNodeIndent(node).goodChar;
    const caseIndent = this.expectedCaseIndent(node, switchIndent);
    this.checkNodesIndent(node.caseBlock.clauses, caseIndent);
    this.checkLastNodeLineIndent(node, switchIndent);
    super.visitSwitchStatement(node);
  }

  protected visitCaseClause(node: ts.CaseClause) {
    this.visitCase(node);
    super.visitCaseClause(node);
  }

  protected visitDefaultClause(node: ts.DefaultClause) {
    this.visitCase(node);
    super.visitDefaultClause(node);
  }

  protected visitWhileStatement(node: ts.WhileStatement) {
    this.blockLessNodes(node);
    super.visitWhileStatement(node);
  }

  protected visitForStatement(node: ts.ForStatement) {
    this.blockLessNodes(node);
    super.visitForStatement(node);
  }

  protected visitForInStatement(node: ts.ForInStatement) {
    this.blockLessNodes(node);
    super.visitForInStatement(node);
  }

  protected visitDoStatement(node: ts.DoStatement) {
    this.blockLessNodes(node);
    super.visitDoStatement(node);
  }

  protected visitVariableDeclaration(node: ts.VariableDeclaration) {
    this.checkIndentInVariableDeclarations(node);
    super.visitVariableDeclaration(node);
  }

  protected visitVariableStatement(node: ts.VariableStatement) {
    super.visitVariableStatement(node);

    // VariableStatement -> VariableDeclarationList -> (VarKeyword, SyntaxList)
    const list = node.getChildAt(0).getChildAt(1);
    if (!list) {
      return;
    }
    const len = list.getChildCount();
    const lastElement = list.getChildAt(len - 1);
    const lastToken = node.getLastToken();
    const lastTokenLine = this.getLine(lastToken, true);
    const lastElementLine = this.getLine(lastElement, true);

    // Only check the last line if there is any token after the last item
    if (lastTokenLine <= lastElementLine) {
      return;
    }

    const tokenBeforeLastElement = list.getChildAt(len - 2);
    if (tokenBeforeLastElement && isKind(tokenBeforeLastElement, 'CommaToken')) {
      // Special case for comma-first syntax where the semicolon is indented
      this.checkLastNodeLineIndent(node, this.getNodeIndent(tokenBeforeLastElement).goodChar);
    } else {
      const nodeIndent = this.getNodeIndent(node).goodChar;
      const varKind = node.getFirstToken().getText();
      const elementsIndent = nodeIndent + indentSize * OPTIONS.VariableDeclarator[varKind];
      this.checkLastNodeLineIndent(node, elementsIndent - indentSize);
    }
  }

  protected visitFunctionDeclaration(node: ts.FunctionDeclaration) {
    if (this.isSingleLineNode(node)) {
      return;
    }
    if (OPTIONS.FunctionDeclaration.parameters === 'first' && node.parameters.length) {
      const indent = this.getLineAndCharacter(node.parameters[0]).character;
      this.checkNodesIndent(node.parameters.slice(1), indent);
    } else if (OPTIONS.FunctionDeclaration.parameters !== null) {
      const nodeIndent = this.getNodeIndent(node).goodChar;
      this.checkNodesIndent(
        node.parameters,
        nodeIndent + indentSize * OPTIONS.FunctionDeclaration.parameters
      );
      const closingParen = node.getChildAt(node.getChildCount() - 2);
      this.checkNodeIndent(closingParen, nodeIndent);
    }

    super.visitFunctionDeclaration(node);
  }

  private checkFunctionMethodExpression(
    node: ts.MethodDeclaration | ts.ConstructorDeclaration | ts.FunctionExpression
  ) {
    if (OPTIONS.FunctionExpression.parameters === 'first' && node.parameters.length) {
      const indent = this.getLineAndCharacter(node.parameters[0]).character;
      this.checkNodesIndent(node.parameters.slice(1), indent);
    } else if (OPTIONS.FunctionExpression.parameters !== null) {
      const nodeIndent = this.getNodeIndent(node).goodChar;
      this.checkNodesIndent(
        node.parameters,
        nodeIndent + indentSize * OPTIONS.FunctionExpression.parameters
      );
      const closingParen = node.getChildAt(node.getChildCount() - 2);
      this.checkNodeIndent(closingParen, nodeIndent);
    }
  }

  protected visitFunctionExpression(node: ts.FunctionExpression) {
    if (this.isSingleLineNode(node)) {
      return;
    }
    this.checkFunctionMethodExpression(node);
    super.visitFunctionExpression(node);
  }

  protected visitMethodDeclaration(node: ts.MethodDeclaration) {
    if (this.isSingleLineNode(node)) {
      return;
    }
    this.checkFunctionMethodExpression(node);
    super.visitMethodDeclaration(node);
  }

  protected visitConstructorDeclaration(node: ts.ConstructorDeclaration) {
    if (this.isSingleLineNode(node)) {
      return;
    }
    this.checkFunctionMethodExpression(node);
    super.visitConstructorDeclaration(node);
  }

  protected visitCallExpression(node: ts.CallExpression) {
    if (this.isSingleLineNode(node)) {
      return;
    }
    if (OPTIONS.CallExpression.arguments === 'first' && node.arguments.length) {
      const indent = this.getLineAndCharacter(node.arguments[0]).character;
      this.checkNodesIndent(node.arguments.slice(1), indent);
    } else if (OPTIONS.CallExpression.arguments !== null) {
      this.checkNodesIndent(
        node.arguments,
        this.getNodeIndent(node).goodChar + indentSize * OPTIONS.CallExpression.arguments
      );
    }
    super.visitCallExpression(node);
  }

  protected visitPropertyAccessExpression(node: ts.PropertyAccessExpression) {
    if (this.isSingleLineNode(node)) {
      return;
    }

    // The typical layout of variable declarations and assignments
    // alter the expectation of correct indentation. Skip them.
    // TODO: Add appropriate configuration options for variable
    // declarations and assignments.
    const varDec = ts.SyntaxKind.VariableDeclaration;
    const funcKind = [ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ArrowFunction];
    if (this.getParentNodeByType<ts.VariableDeclaration>(node, varDec, funcKind)) {
      return;
    }

    const binExp = ts.SyntaxKind.BinaryExpression;
    const funcExp = ts.SyntaxKind.FunctionExpression;
    const binaryNode = this.getParentNodeByType<ts.BinaryExpression>(node, binExp, [funcExp]);
    if (binaryNode && this.isAssignment(binaryNode)) {
      return;
    }

    super.visitPropertyAccessExpression(node);
    if (typeof OPTIONS.MemberExpression === 'undefined') {
      return;
    }

    const propertyIndent = this.getNodeIndent(node).goodChar + indentSize * OPTIONS.MemberExpression;

    // Assuming that the node has three children: [expression, dotToken, name]
    // In typescript < 2.0 we had access to the dotToken as an attribute of the node.
    const dotToken = node.getChildAt(1);
    const checkNodes = [node.name, dotToken];

    this.checkNodesIndent(checkNodes, propertyIndent);
  }

  protected visitReturnStatement(node: ts.ReturnStatement) {
    if (this.isSingleLineNode(node)) {
      return;
    }

    const firstLineIndent = this.getNodeIndent(node).goodChar;

    // in case if return statement is wrapped in parenthesis
    if (isKind(node.expression, 'ParenthesizedExpression')) {
      this.checkLastReturnStatementLineIndent(node, firstLineIndent);
    } else {
      this.checkNodeIndent(node, firstLineIndent);
    }
    super.visitReturnStatement(node);
  }

  protected visitSourceFile(node: ts.SourceFile) {
    // Root nodes should have no indent
    this.checkNodesIndent(node.statements, 0);
    super.visitSourceFile(node);
  }
}

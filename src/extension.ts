import * as vscode from "vscode";
import * as xml2js from "xml2js";

export function deactivate() {
  // 当你的扩展被停用时，此方法会被调用
  // 因为所有 disposable 资源都已添加到 subscriptions 数组中，
  // VS Code 会自动处理它们的清理，因此这里通常不需要额外的清理逻辑。
  // 如果存在未被 subscriptions 管理的资源，则可以在此方法中手动 dispose()。
  Log.appendLine("Stationeers(空间站工程师)IC10行数压缩  卸载成功");
}

let Log: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  Log = vscode.window.createOutputChannel("stationeers-ic10-hangshu-yasuo");
  context.subscriptions.push(Log);

  Log.show(true);
  Log.appendLine("Stationeers(空间站工程师)IC10行数压缩  加载成功");

  context.subscriptions.push(vscode.commands.registerCommand("extension.processSelection.a", 事件一));
  context.subscriptions.push(vscode.commands.registerCommand("extension.processSelection.b", 事件二));
}

function 事件一() {
  将剪切板内容处理后复制到新编辑器(行数压缩);
}

function 事件二() {
  将剪切板内容处理后复制到新编辑器(生成配方入栈指令);
}

const PUSH_HASH_REGEX = /[Hh][Aa][Ss][Hh]\("([^"]+)"\)/;
function 生成配方入栈指令(input: string): string {
  const 试剂物品统计槽长度 = 2; // 每个物品在物品统计表占多少单元（高位地址 + 数量）
  const 配方槽位信息大小 = 2;
  const 试剂槽位信息大小 = 2;
  const 初始数组长度 = 0;
  const 最大数组长度 = 500; // 安全上限，避免无限循环

  const 原始代码 = input.split(/\r?\n/);
  const 试剂特征 = /^#试剂=>\s+(\S+)\s+(\S+)/;
  const 试剂物品特征 = /^#试剂物品=>\s+(\S+)\s+(\S+)\s+(\S+)/;
  const 配方特征 = /^#配方=>\s+(\S+)\s+(\S+)\s+成分=>\s+(.+)/;

  const 试剂简名映射试剂哈希 = new Map<string, number>();
  const 试剂哈希映射试剂物品哈希 = new Map<number, number[]>();
  const 试剂物品哈希映射试剂物品详情 = new Map<number, [number, string, number]>();
  const 全部试剂物品哈希表 = new Set<number>();

  const 配方详情 = new Map<number, [number, string, [string, string][]]>();

  let 当前父级试剂哈希;
  for (let rawLine of 原始代码) {

    const line = rawLine.trim();

    if (!line) { continue; }

    const 试剂 = line.match(试剂特征);
    if (试剂) {
      const 名称 = 试剂[1]; // 支持 HASH("Name") 或 Name 或 整数哈希 这三种, 最终都返回整数哈希
      const 简名 = 试剂[2];
      const 哈希 = 转换整数哈希(名称);

      试剂简名映射试剂哈希.set(简名, 哈希);
      试剂哈希映射试剂物品哈希.set(哈希, []);
      当前父级试剂哈希 = 哈希;
      continue;
    }

    const 试剂物品 = line.match(试剂物品特征);
    if (试剂物品) {
      const 名称 = 试剂物品[1]; // 支持 HASH("Name") 或 Name 或 整数哈希 这三种, 最终都返回整数哈希
      const 简名 = 试剂物品[2];
      const 数量 = 试剂物品[3] || "null";  // 左边为空时,使用右边值
      const 哈希 = 转换整数哈希(名称);

      if (当前父级试剂哈希) {
        const __ = 试剂哈希映射试剂物品哈希.get(当前父级试剂哈希) || [];  // 左边为空时,使用右边值(创建一个空数组)
        __.push(哈希);
        试剂哈希映射试剂物品哈希.set(当前父级试剂哈希, __);
      }

      试剂物品哈希映射试剂物品详情.set(哈希, [哈希, 简名, 解析数量(数量)]);
      全部试剂物品哈希表.add(哈希);
      // Log.appendLine(`# => ${哈希}(${简名}`);
      continue;
    }

    const 配方 = line.match(配方特征);
    if (配方) {
      const 名称 = 配方[1]; // 支持 HASH("Name") 或 Name 或 整数哈希 这三种, 最终都返回整数哈希
      const 简名 = 配方[2];
      const 成分表_文本 = 配方[3];
      const 哈希 = 转换整数哈希(名称);

      const 成分表: [string, string][] = [];
      const 条目表 = 成分表_文本.split(/\s+/).map(s => s.trim()).filter(Boolean);  // 过滤方法 => 判断字符串是否为空串, 返回一个布尔值

      for (const __ of 条目表) {
        const 分隔位置 = __.indexOf("X");
        if (分隔位置 <= 0) { continue; }
        const 名称 = __.substring(0, 分隔位置);   // 支持 HASH("Name") 或 Name 或 整数哈希 这三种, 在使用成分名称前, 会先转换成整数哈希
        const 数量 = __.substring(分隔位置 + 1);
        成分表.push([名称, 数量]);
      }

      配方详情.set(哈希, [哈希, 简名, 成分表]);
      continue;
    }
  }

  // 成分表 => 成分名称没有经过< const 哈希 = 转换整数哈希(名称); > 处理过变成试剂哈希
  for (const [哈希, 哈希_简名_成分表] of 配方详情) {

    const 成分表 = 哈希_简名_成分表[2];

    const __: [string, string][] = 成分表.map(([名称, 数量]) => {
      if (试剂简名映射试剂哈希.has(名称)) { { return [String(试剂简名映射试剂哈希.get(名称))!, 数量]; } }         // 如果源码中的成分名称是试剂简名   // !是TypeScript中的非空断言操作符
      else { return [String(转换整数哈希(名称)), 数量]; }  // 如果源码中的成分名称是 HASH("Name") 或 Name 或 整数哈希 这三种
    });

    配方详情.set(哈希, [哈希_简名_成分表[0], 哈希_简名_成分表[1], __]);
  }

  // 将试剂物品哈希映射到堆栈下标, 以该下标为指针, 指向试剂物品统计槽(试剂物品哈希 => 用于发生哈希碰撞时跳过写入；试剂物品数量 => 从进出口槽位经过时对数量进行加减)
  const 试剂物品统计槽指针数组 = 将试剂物品哈希映射到试剂物品统计槽堆栈指针(Array.from(全部试剂物品哈希表), {
    初始容量: 初始数组长度, 最大容量: 最大数组长度, 元素大小: 试剂物品统计槽长度
  });

  if (!试剂物品统计槽指针数组) { return "ERROR: 无法为物品生成唯一快查索引（可能物品数量过多或哈希冲突无法解决）"; }

  // 计算最大配方试剂数与最大试剂物品数以进行内存对齐
  let 最大配方试剂数 = 0;
  let 最大试剂物品数 = 0;
  let 配方详情数组 = Array.from(配方详情);
  for (const __ of 配方详情数组) {
    const 成分表 = __[1][2];
    最大配方试剂数 = Math.max(最大配方试剂数, 成分表.length);
    for (const 成分 of 成分表) {
      var 试剂哈希 = (parseInt(成分[0]));
      const 试剂物品哈希表 = Array.isArray(试剂哈希映射试剂物品哈希.get(试剂哈希)) ? 试剂哈希映射试剂物品哈希.get(试剂哈希)! : [];
      最大试剂物品数 = Math.max(最大试剂物品数, 试剂物品哈希表.length);
    }
  }

  const 试剂槽长度 = 试剂槽位信息大小 + 最大试剂物品数;   // 指针指向试剂物品统计槽
  const 配方槽长度 = 配方槽位信息大小 + (最大配方试剂数 * 试剂槽长度);
  const 配方详情数组起始 = 试剂物品统计槽指针数组.实际容量 + 2;
  const 配方详情数组长度 = 配方详情数组.length * 配方槽长度;
  const 试剂物品统计槽表起始 = 配方详情数组起始 + 配方详情数组长度 + 2;
  const 试剂物品统计槽表长度 = (全部试剂物品哈希表.size) * 试剂物品统计槽长度;

  // --- 开始生成指令列表
  const 指令序列: string[] = [];
  指令序列.push(`#<试剂物品统计槽指针数组>基址=1  -------  长度=${试剂物品统计槽指针数组.实际容量}`);
  指令序列.push(`#<配方详情数组>基址=${配方详情数组起始}  -------  长度=${配方详情数组长度}`);
  指令序列.push(`#<试剂物品统计槽表>基址=${试剂物品统计槽表起始}  -------  长度:${试剂物品统计槽表长度}`);
  指令序列.push(`#总堆栈占用:${试剂物品统计槽表起始 + 试剂物品统计槽表长度 - 1}`);
  指令序列.push(`#通过插槽的物品,读取其哈希,通过<(Math.abs(物品哈希) % <试剂物品统计槽指针数组>长度) + 1>运算后得到物品统计槽指针`);
  指令序列.push(`#再用get[指针]获取物品统计槽地址, pop 物品哈希 => 用于发生哈希碰撞时跳过写入, pop 物品数量 => 从进出口槽位经过时对数量进行加减`);
  指令序列.push("");

  指令序列.push(`clr db`);

  for (const [哈希, { 指针地址: 指针, 统计槽表基址偏移: 偏移 }] of 试剂物品统计槽指针数组.统计槽表.entries()) {
    const __ = 试剂物品哈希映射试剂物品详情.get(哈希);
    指令序列.push(`poke ${指针 - 1} ${试剂物品统计槽表起始 + 偏移}         #试剂物品统计槽[${__?.[1]} , ${__?.[0]}]`);
  }

  指令序列.push("");
  指令序列.push(`#配方详情数组`);
  指令序列.push(`#配方槽长度${配方槽长度} = 配方槽位信息大小${配方槽位信息大小} + 最大配方试剂数${最大配方试剂数} * (试剂槽位信息大小${试剂槽位信息大小} + 最大试剂物品数${最大试剂物品数})`);
  指令序列.push("");

  let 高位首地址 = 配方详情数组起始 + 配方槽长度 - 2;
  for (const __ of 配方详情数组) {

    var ____ = __[1];
    let 计数 = 0;

    指令序列.push(`\n#配方槽 => ${____[1]}(${____[0]})        写入地址 => ${高位首地址 - 计数 + 1}`);
    指令序列.push(`poke ${高位首地址 - 计数} ${____[0]}             #配方哈希`);

    for (let t = 1; t < 配方槽位信息大小; t++) {
      计数++;
      let 最小试剂数量总和 = 0;
      for (let tt = 0; tt < ____[2].length; tt++) {
        最小试剂数量总和 += parseInt((____[2])[tt][1]);
      }
      指令序列.push(`poke ${高位首地址 - 计数} ${最小试剂数量总和}            #配方最小试剂数量总和`);
    }

    for (let e = 0; e < 最大配方试剂数; e++) {

      const 成分表 = __[1][2];

      if (e < 成分表.length) {

        const 成分 = 成分表[e];
        const 试剂哈希 = (parseInt(成分[0]));
        const 数量 = 成分[1];

        const items = Array.isArray(试剂哈希映射试剂物品哈希.get(试剂哈希)) ? 试剂哈希映射试剂物品哈希.get(试剂哈希)! : [];
        const 简名 = 试剂物品哈希映射试剂物品详情.get(items[0])?.[1];;

        计数++;
        指令序列.push(`poke ${高位首地址 - 计数} ${试剂哈希}             #试剂槽[${简名}]`);
        计数++;
        指令序列.push(`poke ${高位首地址 - 计数} ${数量}              #试剂数量`);

        for (let t = 2; t < 试剂槽位信息大小; t++) {
          计数++;
          指令序列.push(`poke ${高位首地址 - 计数} 0             #预留试剂槽位信息占位`);
        }

        for (let k = 0; k < 最大试剂物品数; k++) {

          if (k < items.length) {

            const 试剂物品哈希 = items[k];
            const __ = 试剂物品统计槽指针数组.统计槽表.get(试剂物品哈希);

            计数++;
            const 简名 = 试剂物品哈希映射试剂物品详情.get(试剂物品哈希)?.[1];

            if (__) { 指令序列.push(`poke ${高位首地址 - 计数} ${试剂物品统计槽表起始 + __.统计槽表基址偏移}          #试剂物品统计槽[${简名} , ${试剂物品哈希}]`); }
            else { 指令序列.push(`poke ${高位首地址 - 计数} 0            #该试剂无其它可代替物品`); }
          }
          else { 计数++; 指令序列.push(`poke ${高位首地址 - 计数} 0                              #占位`); }
        }
      }
      else {

        for (let t = 0; t < 试剂槽位信息大小; t++) {
          计数++;
          指令序列.push(`poke ${高位首地址 - 计数} 0                              #占位`);

        }

        for (let k = 0; k < 最大试剂物品数; k++) {
          计数++;
          指令序列.push(`poke ${高位首地址 - 计数} 0                              #占位`);
        }
      }

    }

    for (let k = 计数 + 1; k < 配方槽长度; k++) {
      计数++;
      指令序列.push(`poke ${高位首地址 - 计数} 0                               #占位`);
    }

    高位首地址 += 配方槽长度;
  }

  指令序列.push("");
  指令序列.push(`#试剂物品统计槽表`);
  指令序列.push("");

  for (const [哈希, { 指针地址: 指针, 统计槽表基址偏移: 偏移 }] of 试剂物品统计槽指针数组.统计槽表.entries()) {

    let 计数 = 0;

    const __ = 试剂物品哈希映射试剂物品详情.get(哈希);
    const ____ = 试剂物品统计槽表起始 + 偏移;

    指令序列.push(`poke ${____} ${哈希}              #试剂物品统计槽[${__?.[1]}]`);
    计数++;
    指令序列.push(`poke ${____ - 计数} ${__?.[2]}                 #试剂物品数量`);

    for (let k = 2; k < 试剂物品统计槽长度; k++) { 计数++; 指令序列.push(`poke ${____ - 计数} 0                              #占位`); }
  }

  指令序列.push("");
  指令序列.push(`#写入完毕`);

  return 指令序列.join("\n");
}

function 转换整数哈希(str: string | number): number {
  if (typeof str === "number") { return (str | 0); }
  const string = String(str).trim();
  const match = string.match(PUSH_HASH_REGEX);
  if (match) { return (crc32Signed(match[1])); }    // HASH("Name") -> 计算 crc32Signed(Name)
  if (/^-?\d+$/.test(string)) { return (parseInt(string, 10) | 0); }    // 直接是数字字符串
  return (crc32Signed(string));    // 直接是Name -> 计算 crc32Signed(Name)
}

// 从"储量X-1" 或任意包含 X 的字符串里抽出数字
function 解析数量(d: string): number {
  const match = d.match(/X\s*(-?\d+)/i);
  if (match) { return (parseInt(match[1])); }
  const m2 = d.match(/-?\d+/);   // 若只有数字
  return m2 ? (parseInt(m2[0])) : -1;
}

function 将试剂物品哈希映射到试剂物品统计槽堆栈指针(all: number[], options: { 初始容量: number, 最大容量: number, 元素大小: number }) {

  let 哈希桶容量 = Math.max(Math.ceil(all.length), options.初始容量);
  if (哈希桶容量 < 1) { 哈希桶容量 = 1; }

  while (哈希桶容量 <= options.最大容量) {

    const 防重 = new Set<number>();
    const 统计槽表 = new Map<number, { 指针地址: number, 统计槽表基址偏移: number }>();

    let 计数 = 0;
    let 哈希碰撞么 = false;

    for (const intHash of all) {

      const 取指针地址 = (Math.abs(intHash) % 哈希桶容量) + 1;  // 哈希算法

      if (防重.has(取指针地址)) { 哈希碰撞么 = true; break; }
      防重.add(取指针地址);

      统计槽表.set(intHash, { 指针地址: 取指针地址, 统计槽表基址偏移: 计数 * options.元素大小 });
      计数++;

    }

    if (!哈希碰撞么) { return { 实际容量: 哈希桶容量, 统计槽表: 统计槽表 }; }
    哈希桶容量++;
  }

  return null; // 无法解决哈希碰撞
}

const POLY = 0xEDB88320 >>> 0;

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i >>> 0;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (POLY ^ (c >>> 1)) >>> 0 : (c >>> 1) >>> 0;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

/* 返回无符号 32-bit CRC 值（0..4294967295）*/
function crc32Unsigned(input: string | Uint8Array): number {
  let bytes;
  if (typeof input === 'string') {
    if (typeof TextEncoder !== 'undefined') {
      bytes = new TextEncoder().encode(input);      // UTF-8 编码字符串
    }
    else {
      bytes = Buffer.from(input, 'utf8');       // 旧环境（如某些老 Node 版本）回退到 Buffer
    }
  }
  else {
    bytes = input;
  }
  let crc = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    crc = (CRC32_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8)) >>> 0;
  }
  crc = (crc ^ 0xFFFFFFFF) >>> 0;
  return crc;
}

/* 返回有符号 32-bit CRC 值（-2147483648 .. 2147483647） */
function crc32Signed(input: string | Uint8Array): number {
  const unsigned = crc32Unsigned(input);
  // 把无符号值转换成 JS 的有符号 32-bit 表示
  // 两种等价写法：return unsigned | 0; 或者下面的判断式
  return (unsigned | 0);
}


async function 将剪切板内容处理后复制到新编辑器(回调: Function): Promise<void> {
  const 焦点编辑面板 = vscode.window.activeTextEditor;
  if (!焦点编辑面板) {
    vscode.window.showInformationMessage("没有打开的编辑器");
    return;
  }
  const 框选控件 = 焦点编辑面板.selection;
  if (框选控件.isEmpty) {
    vscode.window.showInformationMessage("请选择一些文本后再运行此命令");
    return;
  }
  // 框选文本:
  // 文本编辑器可以看作是一个网格,鼠标单击时,鼠标坐标对齐到网格坐标,然后鼠标拖动,最后当鼠标弹起时得到另一个网格坐标
  // 因此框选记录保存了框选的起始网格坐标和结束网格坐标,获取文本内容的方式就很简单了,
  // 网格坐标是第几行第几列,要获取的字符就在第几行第几列,具体见以下示例
  //  for (var i = 起始网格坐标.y; i <= 结束网格坐标.y; i++) {
  //    for (var u = 起始网格坐标.x; u <= 结束网格坐标.x; u++) {
  //      var 网格字符 = 网格[i * 网格宽 + u];
  //    }
  //  }
  // 在这个双循环中,遍历每一行的所有列,得到框选文本
  // 当然这是一个对齐框选算法,若是普通框选,中间的循环中,列的循环是从第0列->末尾列
  const 框选文本 = 焦点编辑面板.document.getText(框选控件);
  // await是状态标签, 有几个await就有几个状态标签,await后面的代码就是该状态的指令
  // async调用的方式是创建一个对象
  // 每一帧该对象都会跳转到状态标签,然后读取该状态的指令返回状态值,若不为真,直接return,若为真,则接收返回值并跳转到下一个状态
  // 简单说,这就是一种语法糖,由编译器帮忙将这种口语法的代码转换成一大堆跳转指令
  try {
    const 结果 = await 回调(框选文本);
    await vscode.env.clipboard.writeText(结果);         // 将结果复制到剪切板
    const 编程语言标识符 = 焦点编辑面板.document.languageId;
    const 新的文本编辑器 = await vscode.workspace.openTextDocument({ content: 结果, language: 编程语言标识符 });
    // 在多页面选项卡布局中添加一个按钮, 并将新的文本编辑器挂载到该按钮上
    await vscode.window.showTextDocument(新的文本编辑器, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
      preview: false
    });
  }
  catch (err) {
    vscode.window.showErrorMessage("处理文本时出错: " + (err instanceof Error ? err.message : String(err)));
  }
}

function 行数压缩(input: string): string {
  const 词条表 = new Map();
  const 行号表 = new Map();
  const 跳转标签特征 = /^(\S+):/;
  const pushHashRegex = /[Hh][Aa][Ss][Hh]\("([^"]+)"\)/gm;
  const 初加工代码 = [];
  const 压缩后代码 = [];

  const 原始代码 = input.split(/\r?\n/).filter((line) => {
    var __ = line.trim();
    if (__ == "" || __.startsWith('#')) {
      return false;
    }
    return true;
  });

  for (let i = 0; i < 原始代码.length; i++) {
    // 清空前导和后导空格
    let 注释截取 = 原始代码[i].indexOf('#');

    if (注释截取 >= 0) {
      原始代码[i] = 原始代码[i].substring(0, 注释截取).trim();
    }
    else {
      原始代码[i] = 原始代码[i].trim();
    }

    // 将标签定义行删除掉, 并记录标签定义的值
    if (原始代码[i].startsWith("alias") || 原始代码[i].startsWith("define")) {
      let 拆分 = 原始代码[i].split(/\s+/);
      let 别名 = 拆分[1];
      let 值 = 拆分[2];
      词条表.set(别名, 值); // 在后面将指令中的 (r?和d?和num) 替换回去
      原始代码[i] = "";
    }
    else {
      let 匹配 = 原始代码[i].match(跳转标签特征);
      if (匹配) {
        let 别名 = 匹配[1];
        if (是否需要翻译(别名)) {
          词条表.set(别名, 生成随机英文());
        } // 自定义行号标签含有非英文字符,ic10不支持,在后面替换成随机英文
      }
    }

    if (原始代码[i] !== "") {
      初加工代码.push(原始代码[i]); // 以上处理结束后,如果此行变成了空行,则忽视此行   
    }
  }

  let 代码文本 = 初加工代码.join("\n");
  const 降序词条Key表 = Array.from(词条表.keys()).sort((a, b) => b.length - a.length);

  for (const 词条Key of 降序词条Key表) {
    const 词条 = 词条表.get(词条Key);
    const 正则 = new RegExp(`${字面量处理(词条Key)}`, 'g');
    代码文本 = 代码文本.replace(正则, `${词条}`); // 全字匹配替换
    // Log.appendLine(`打印词条表 [${正则}, ${词条}]`);
  }
  // Log.appendLine(`词条替换结果\n ${代码文本}`);

  const 中间代码 = 代码文本.split(/\r?\n/);
  var IC行号偏移 = 0;

  for (let i = 0; i < 中间代码.length; i++) {
    let 匹配 = 中间代码[i].match(跳转标签特征);

    if (匹配) {
      行号表.set(匹配[1], `${i - IC行号偏移}`); // 将自定义行号标签替换成原始行号
      中间代码[i] = ""; // 移除这一行的自定义行号标签
      IC行号偏移++; // 下一个自定义行号标签的行号向上顺位
    }

    if (中间代码[i] !== "") { // 以上处理结束后,如果此行变成了空行,则忽视此行   
      {
        压缩后代码.push(中间代码[i]);
      }
    }

  }

  代码文本 = 压缩后代码.join("\n");
  const 降序行号表Key表 = Array.from(行号表.keys()).sort((a, b) => b.length - a.length);

  for (const 行号Key of 降序行号表Key表) {
    const 行号 = 行号表.get(行号Key);
    const 正则 = new RegExp(`${字面量处理(行号Key)}`, 'g');
    代码文本 = 代码文本.replace(正则, 行号); // 全字匹配替换
  }

  代码文本 = 代码文本.replace(pushHashRegex, (match, inner) => {
    try {
      // Log.appendLine(`捕获整: ${match}`);
      // Log.appendLine(`捕获: ${inner}`);
      return `${crc32Signed(inner)}`;
    }
    catch (err) {
      // 出错时保留原样并把错误写到输出面板（如果可用）
      Log.appendLine(`Hash转换失败: "${inner}" -> ${String(err)}`);
      return match;
    }
  });

  return 代码文本;
}

/* 生成较短的唯一标签 */
let _genCounter = 0;
function 生成随机英文(长度 = 12): string {
  _genCounter++;
  // 使用时间 + 随机数 + 计数，保证在快速生成时也不会重复
  const r = Math.floor(Math.random() * 0xFFFF).toString(16);
  return `AR${_genCounter}${r}`.substring(0, 长度);
}

/* 判断是否存在非ascii字符 */
function 是否需要翻译(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

/* 有些字符在正则表达式中会被当成操作数使用,这些字符就需要加上"这是字符标识" */
function 字面量处理(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

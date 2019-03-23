// Developed by Vladimir Korovin for Telegram Contest 10-24 March 2019
// vladimir.korovin@inbox.ru
// opexos@gmail.com
!function (opexcharts, undefined) {
    'use strict';

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Common static methods ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    function lerp(start, end, time) {
        //time must be in range 0..1
        time = time < 0 ? 0 : time;
        time = time > 1 ? 1 : time;
        return (1 - time) * start + time * end;
    }

    function ease(start, end, time) {
        //time must be in range 0..1
        time = time < 0 ? 0 : time;
        time = time > 1 ? 1 : time;
        time = time * (2 - time); //easeOutQuad
        return (1 - time) * start + time * end;
    }

    function clamp(min, max, value) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    function callForEach(arrayOfObjects, method) {
        var args = arguments;
        arrayOfObjects.forEach(function (o) {
            if (typeof o[method] === 'function') {
                o[method].apply(o, Array.prototype.slice.call(args, 2));
            }
        })
    }

    function arraysIsEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        for (var i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    }

    function niceNum(num) {
        if (num === undefined) return '';
        num = num | 0;
        if (num < 100) return num;
        if (num < 1000) return ((num / 10) | 0) * 10;
        if (num < 1000000) return ((num / 100) | 0) / 10 + 'k';
        return ((num / 100000) | 0) / 10 + 'm';
    }

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Chart control ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    function Chart(canvas, data, theme, dpr) {
        this.dpr = dpr || 1; //device pixel ratio
        this.theme = this.prepareTheme(theme || opexcharts.dayTheme, this.dpr);
        this.canvas = canvas;
        this.redraw = true;
        this.ctx = canvas.getContext('2d');
        this.data = data;
        this.objects = [];
        this.lines = {};
        this.initEvents();
        this.prepare();
        //start animations
        var self = this;
        window.requestAnimationFrame(function (timestamp) {
            self.mainLoop.call(self, timestamp);
        });
    }

    Chart.prototype.prepareTheme = function (theme, dpr) {
        //change theme according to devicePixelRatio
        var newTheme = {};
        for (var prop in theme) {
            newTheme[prop] = typeof theme[prop] === 'number' ? theme[prop] * dpr : theme[prop];
        }
        return newTheme;
    };


    Chart.prototype.initEvents = function () {
        var self = this;

        this.canvas.addEventListener('mousemove', function (e) {
            e.preventDefault();
            callForEach(self.objects, 'onMouseMove', e.offsetX, e.offsetY);
        });

        this.canvas.addEventListener('mousedown', function (e) {
            e.preventDefault();
            if (e.button === 0) {
                callForEach(self.objects, 'onMouseDown', e.offsetX, e.offsetY, false);
            }
        });

        this.canvas.addEventListener('mouseup', function (e) {
            e.preventDefault();
            if (e.button === 0) {
                callForEach(self.objects, 'onMouseUp', e.offsetX, e.offsetY);
            }
        });

        this.canvas.addEventListener('mouseover', function (e) {
            e.preventDefault();
            callForEach(self.objects, 'onMouseOver', e);
        });

        this.canvas.addEventListener('mouseout', function (e) {
            e.preventDefault();
            callForEach(self.objects, 'onMouseOut');
        });

        this.canvas.addEventListener('touchstart', function (e) {
            e.preventDefault();
            var pos = self.getXY(e.changedTouches[0]);
            callForEach(self.objects, 'onMouseDown', pos.x, pos.y, true);
        });

        this.canvas.addEventListener('touchend', function (e) {
            e.preventDefault();
            var pos = self.getXY(e.changedTouches[0]);
            callForEach(self.objects, 'onMouseUp', pos.x, pos.y);
        });

        this.canvas.addEventListener('touchmove', function (e) {
            e.preventDefault();
            var pos = self.getXY(e.changedTouches[0]);
            callForEach(self.objects, 'onMouseMove', pos.x, pos.y);
        });
    };

    Chart.prototype.getXY = function (touch) {
        var rect = this.canvas.getBoundingClientRect();
        return {
            x: touch.pageX - rect.left,
            y: touch.pageY - this.canvas.offsetTop
        }
    };

    Chart.prototype.prepare = function () {
        //find lines in 'columns' array
        for (var i = 0; i < this.data.columns.length; i++) {
            var code = this.data.columns[i][0];
            switch (this.data.types[code]) {
                case 'line':
                    this.lines[code] = {
                        index: i,
                        visible: true,
                        visibility: 1
                    };
                    break;
                case 'x':
                    this.xIndex = i;
                    break;
            }
        }

        //initialize y coordinate
        var currentY = this.canvas.height;
        currentY -= this.theme.buttonBorderIndent;
        currentY -= this.theme.buttonHeight;

        //create hint buttons
        var currentX = this.theme.buttonBorderIndent;
        for (code in this.data.names) {
            var btn = new ButtonWidget(this, code, this.data.names[code], this.data.colors[code], currentX);
            btn.y = currentY;
            this.objects.push(btn);
            currentX += btn.w + this.theme.buttonInterval;
        }

        //move y coordinate
        currentY -= this.theme.componentInterval;
        currentY -= this.theme.navChartHeight;

        //create nav chart
        var navChart = new NavChartWidget(this, 0, currentY, this.canvas.width, this.theme.navChartHeight);
        this.objects.push(navChart);

        //move y coordinate
        currentY -= this.theme.componentInterval;

        //create chart
        var ch = new ChartWidget(this, 0, 0, this.canvas.width, currentY);
        this.objects.push(ch);

        //notify all objects about nav chart state
        navChart.notifySelectionChanged();
    };

    Chart.prototype.getValueRange = function (start, end) {
        //find min and max value for visible parts of lines. start,end - inclusive array indexes
        var min, max, val;
        for (var code in this.lines) {
            var line = this.lines[code];
            if (line.visible) {
                for (var j = start || 1/*zero element is column name*/; j <= (end || this.data.columns[line.index].length - 1); j++) {
                    val = this.data.columns[line.index][j];
                    if (min === undefined) min = val;
                    if (max === undefined) max = val;
                    min = Math.min(min, val);
                    max = Math.max(max, val);
                }
            }
        }
        return {
            min: min || 0,
            max: max || 0
        };
    };

    Chart.prototype.mainLoop = function (frameTimestamp) {
        //update objects
        var deltaTime = frameTimestamp - this.previousFrameTimestamp;
        this.previousFrameTimestamp = frameTimestamp;
        this.objects.forEach(function (obj) {
            obj.update(deltaTime || 0);
        });

        //draw main chart
        if (this.redraw) {
            this.redraw = false;
            this.ctx.fillStyle = this.theme.background;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        //draw objects
        this.objects.forEach(function (obj) {
            obj.draw(this.ctx, this.theme);
        }, this);

        //draw next frame
        var self = this;
        window.requestAnimationFrame(function (timestamp) {
            self.mainLoop.call(self, timestamp);
        });
    };

    Chart.prototype.setTheme = function (theme) {
        this.theme = this.prepareTheme(theme, this.dpr);
        this.redraw = true;
        callForEach(this.objects, 'fullRedraw');
    };

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Base object ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    function Obj(chart, x, y, w, h) {
        this.chart = chart;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.transitions = [];
    }

    Obj.prototype.hit = function (x, y) {
        return x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h;
    };

    Obj.prototype.addTransition = function (start, end, time, obj, prop, valueChangedCallback, finishCallback, func) {
        var isArray = Array.isArray(prop);
        //delete transitions with same obj and prop
        this.transitions = this.transitions.filter(function (tr) {
            return !(tr.obj === obj && (isArray ? arraysIsEqual(tr.prop, prop) : (tr.prop === prop)));
        });
        //add new transition to array
        this.transitions.push({
            start: start,
            end: end,
            time: time,
            obj: obj,
            prop: prop,
            valueChangedCallback: valueChangedCallback,
            finishCallback: finishCallback,
            elapsed: 0,
            isArray: isArray,
            func: func || ease
        });
    };

    Obj.prototype.update = function (deltaTime) {
        //process transitions
        this.transitions.forEach(function (tr) {
            tr.elapsed += deltaTime;
            var t = clamp(0, 1, tr.elapsed / tr.time);
            if (tr.isArray) {
                for (var i = 0; i < tr.prop.length; i++) {
                    tr.obj[tr.prop[i]] = tr.func(tr.start[i], tr.end[i], t);
                }
            } else {
                tr.obj[tr.prop] = tr.func(tr.start, tr.end, t);
            }
            if (tr.valueChangedCallback !== undefined) {
                tr.valueChangedCallback.call(this);
            }
            if (tr.elapsed >= tr.time && tr.finishCallback !== undefined) {
                tr.finishCallback.call(this);
            }
        }, this);
        //delete finished transitions
        this.transitions = this.transitions.filter(function (tr) {
            return tr.elapsed < tr.time
        });
    };

    Obj.prototype.setFont = function (ctx, fontSize, bold) {
        ctx.font = (bold ? "bold " : "") + fontSize + 'px arial';
    };

    Obj.prototype.getTextWidth = function (ctx, text) {
        return ctx.measureText(text).width;
    };

    Obj.prototype.roundedRectPath = function (ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
    };


    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Base chart ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    function BaseChart(chart, x, y, w, h) {
        Obj.apply(this, arguments);
        //create internal canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx = this.canvas.getContext('2d');
    }

    BaseChart.prototype = Object.create(Obj.prototype);

    BaseChart.prototype.triggerRedrawLines = function () {
        this.redrawLines = true
    };

    BaseChart.prototype.recalcVertical = function () {
        var newValues = this.calc();
        this.addTransition(
            [this.yStep || newValues.yStep,
                this.minValue || newValues.minValue,
                this.maxValue || newValues.maxValue],
            [newValues.yStep,
                newValues.minValue,
                newValues.maxValue
            ], 300, this, ['yStep', 'minValue', 'maxValue'], this.triggerRedrawLines);
    };

    BaseChart.prototype.visibleLinesChanged = function () {
        this.recalcVertical();
    };

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // ChartWidget component ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    function ChartWidget(chart, x, y, w, h) {
        BaseChart.apply(this, arguments);
        var theme = chart.theme;
        this.canvas.height -= theme.xAxisHeight; //decrease height of internal canvas
        this.strokes = this.chart.data.columns[0].length - 2;//zero element is column name
        this.hintAlpha = 0;
        this.hintVisible = false;
        this.hintDates = []; //cache string representation
        this.xAxisDates = []; //cache string representation
        this.hintWindowHeight = theme.hintTitleFontSize + theme.hintValueFontSize + theme.hintLineNameFontSize +
            theme.hintIndentBorder * 2 + theme.hintIndentTitleValue + theme.hintIndentValueName;
        this.hintWindowHeightWithShadow = this.hintWindowHeight + theme.hintShadowOffsetY + theme.hintShadowBlur
            + 2 * this.chart.dpr/*prevent draw to other components*/;
        this.hintWindowWidth = []; //cache calculated coordinates and width
        this.setFont(chart.ctx, theme.axisFontSize);
        this.xAxisDateWidth = (this.getTextWidth(chart.ctx, 'May 30') * 1.3) | 0; //calc max width + some indent
        this.yAxisLineStep = ((this.h - theme.chartIndent * 2 - theme.xAxisHeight) / 5) | 0;
        this.globalRange = chart.getValueRange();
        this.yAxisAnimation = NaN;
        this.yAxisAnimationTarget = 0;
        this.yAxisIndent = 3 * this.chart.dpr;
    }

    ChartWidget.prototype = Object.create(BaseChart.prototype);

    ChartWidget.prototype.hintDateFormat = {weekday: 'short', month: 'short', day: 'numeric'};
    ChartWidget.prototype.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    ChartWidget.prototype.fullRedraw = function () {
        this.redrawLines = true;
        this.redrawPointsAndHint = true;
        this.redrawXAxis = true;
    };

    ChartWidget.prototype.getHorizontalLineY = function (theme, num, anim) {
        return this.y + this.h - theme.xAxisHeight - this.chart.dpr - num * this.yAxisLineStep - (anim ? (this.yAxisAnimation % 1) * this.yAxisLineStep : 0);
    };

    ChartWidget.prototype.draw = function (ctx, theme) {
        if (this.redrawLines) { //redraw if state changed
            this.redrawLines = false;
            //draw to internal canvas
            var ctxi = this.ctx;
            //clear
            ctxi.fillStyle = theme.background;
            ctxi.fillRect(0, 0, ctxi.canvas.width, ctxi.canvas.height);
            //draw horizontal lines
            ctxi.beginPath();
            for (var k = 0; k <= 5; k++) {
                var y = this.getHorizontalLineY(theme, k, true);
                ctxi.moveTo(this.x, y);
                ctxi.lineTo(this.x + this.w, y);
            }
            //if y axis is in animation, draw zero line
            if (this.yAxisAnimation % 1 !== 0) {
                y = this.getHorizontalLineY(theme, 0, false);
                ctxi.moveTo(this.x, y);
                ctxi.lineTo(this.x + this.w, y);
            }
            ctxi.strokeStyle = theme.axisLineColor;
            ctxi.lineWidth = theme.axisLineWidth;
            ctxi.stroke();
            //draw charts
            for (var code in this.chart.lines) {
                var line = this.chart.lines[code];
                if (line.visibility > 0) {
                    ctxi.beginPath();
                    for (var j = this.startIdx; j <= this.endIdx; j++) {
                        var x = this.getPointX(j);
                        y = this.getPointY(j, line.index);
                        if (j === this.startIdx) {
                            ctxi.moveTo(x, y);
                        } else {
                            ctxi.lineTo(x, y);
                        }
                    }
                    ctxi.lineWidth = theme.chartLineWidth;
                    ctxi.lineJoin = "round";
                    ctxi.strokeStyle = this.chart.data.colors[code];
                    ctxi.globalAlpha = line.visibility;
                    ctxi.stroke();
                    ctxi.globalAlpha = 1;
                }
            }
            //draw y axis values
            this.yAxisBottom = this.yAxisBottom || this.getHorizontalLineY(theme, 0, false);
            this.yAxisTop = this.yAxisTop || this.getHorizontalLineY(theme, 5, false);
            this.setFont(ctxi, theme.axisFontSize);
            ctxi.fillStyle = theme.axisFontColor;
            ctxi.textBaseline = 'bottom';
            ctxi.textAlign = 'left';
            for (k = 0; k <= 5; k++) {
                y = this.getHorizontalLineY(theme, k, true) - this.yAxisIndent;
                var val = niceNum(lerp(this.minValue, this.maxValue, (this.yAxisBottom - y) / (this.yAxisBottom - this.yAxisTop)));
                ctxi.fillText(val, this.x, y);
            }
            //if y axis is in animation, draw value for zero line
            if (this.yAxisAnimation % 1 !== 0) {
                y = this.getHorizontalLineY(theme, 0, false) - this.yAxisIndent;
                val = niceNum(this.minValue);
                ctxi.fillText(val, this.x, y);
            }
            //draw to primary canvas
            this.drawInternalCanvas(ctx, theme);
        }
        if (this.redrawPointsAndHint) {
            this.redrawPointsAndHint = false;
            this.drawInternalCanvas(ctx, theme);
            //draw selected points
            if (this.selectedIdx !== undefined) {
                if (this.hintVisible) {
                    x = this.getPointX(this.selectedIdx);
                    //draw vertical line
                    ctx.beginPath();
                    ctx.moveTo(x, this.y);
                    ctx.lineTo(x, this.y + this.h - theme.xAxisHeight - 1);
                    ctx.strokeStyle = theme.axisLineColor;
                    ctx.lineWidth = theme.axisLineWidth;
                    ctx.stroke();
                    //draw points
                    this.forEachVisibleLine(function (code, line) {
                        //draw point on top each line
                        var y = this.getPointY(this.selectedIdx, line.index);
                        ctx.beginPath();
                        ctx.arc(x, y, theme.chartDotRadius, 0, 2 * Math.PI);
                        ctx.fillStyle = this.chart.data.colors[code];
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(x, y, theme.chartDotRadius - theme.chartDotThickness, 0, 2 * Math.PI);
                        ctx.fillStyle = theme.background;
                        ctx.fill();
                    });
                }
                this.drawHint(ctx, theme);
            }
        }
        if (this.redrawXAxis) {
            this.redrawXAxis = false;
            ctx.fillStyle = theme.background;
            ctx.fillRect(this.x, this.y + this.h - theme.xAxisHeight, this.w, theme.xAxisHeight);
            this.setFont(ctx, theme.axisFontSize);
            ctx.fillStyle = theme.axisFontColor;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            var textY = this.y + this.h - theme.xAxisHeight / 2;
            var pointsCntOutside = (this.xAxisDateWidth / 2 / this.xStep) | 0;
            for (var i = clamp(1, this.strokes, this.startIdx - pointsCntOutside);
                 i <= clamp(1, this.strokes, this.endIdx + pointsCntOutside);
                 i++) {
                var draw = this.drawEach > this.prevDrawEach ?
                    (i % this.drawEach === 0 ? 1 : (i % this.prevDrawEach === 0 ? 2 : 0)) :
                    (i % this.prevDrawEach === 0 ? 2 : (i % this.drawEach === 0 ? 1 : 0));
                if (draw > 0) {
                    var dat = this.chart.data.columns[this.chart.xIndex][i];
                    var date = this.getXAxisDate(dat);
                    ctx.globalAlpha = ((draw === 2 && this.drawEach > this.prevDrawEach)
                        || (draw === 1 && this.drawEach < this.prevDrawEach)) ? this.axisVis : 1;
                    ctx.fillText(date, this.getPointX(i), textY);
                    ctx.globalAlpha = 1;
                }
            }
        }
    };

    ChartWidget.prototype.forEachVisibleLine = function (callback) {
        for (var code in this.chart.lines) {
            var line = this.chart.lines[code];
            if (line.visible) {
                callback.call(this, code, line);
            }
        }
    };

    ChartWidget.prototype.calcHintWindowWidth = function (idx) {
        if (this.hintWindowWidth[idx] !== undefined) {
            return this.hintWindowWidth[idx];
        }
        var ctx = this.chart.ctx;
        var theme = this.chart.theme;
        var offset = theme.hintIndentBorder;
        var result = []; //array of x coordinates

        //calculate labels coordinates for each line
        this.forEachVisibleLine(function (code, line) {
            result.push(offset);

            this.setFont(ctx, theme.hintValueFontSize, true);
            var valueWidth = this.getTextWidth(ctx, this.chart.data.columns[line.index][idx]);

            this.setFont(ctx, theme.hintLineNameFontSize);
            var nameWidth = this.getTextWidth(ctx, this.chart.data.names[code].length);

            offset += theme.hintIndentBorder + Math.max(valueWidth, nameWidth);
        });

        //title width
        this.setFont(ctx, theme.hintTitleFontSize);
        var titleWidth = this.getTextWidth(ctx, this.getHintTitleDate(this.chart.data.columns[this.chart.xIndex][idx]))
            + theme.hintIndentBorder * 2;

        //last array element is total width
        result.push(Math.max(offset, titleWidth));

        this.hintWindowWidth[idx] = result; //save to cache
        return result;
    };

    ChartWidget.prototype.getHintTitleDate = function (date) {
        if (this.hintDates[date] === undefined) {
            this.hintDates[date] = new Date(date).toLocaleDateString("en-US", this.hintDateFormat);
        }
        return this.hintDates[date];
    };

    ChartWidget.prototype.getXAxisDate = function (date) {
        if (this.xAxisDates[date] === undefined) {
            var t = new Date(date);
            this.xAxisDates[date] = this.months[t.getMonth()] + ' ' + t.getDate(); //much faster than Date.toLocaleDateString
        }
        return this.xAxisDates[date];
    };


    ChartWidget.prototype.drawHint = function (ctx, theme) {
        if (this.hintAlpha === 0) return;
        var xArr = this.calcHintWindowWidth(this.selectedIdx);

        ctx.globalAlpha = this.hintAlpha;

        //draw window
        this.roundedRectPath(ctx, this.hintX, this.hintY,
            xArr[xArr.length - 1], this.hintWindowHeight, theme.hintWindowRoundCorner);
        ctx.shadowColor = theme.hintShadow;
        ctx.shadowBlur = theme.hintShadowBlur;
        ctx.shadowOffsetX = theme.hintShadowOffsetX;
        ctx.shadowOffsetY = theme.hintShadowOffsetY;
        ctx.style = theme.hintBackground;
        ctx.stroke();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = theme.hintBackground;
        ctx.fill();

        //draw date
        ctx.fillStyle = theme.hintTitleColor;
        this.setFont(ctx, theme.hintTitleFontSize);
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(this.getHintTitleDate(this.chart.data.columns[this.chart.xIndex][this.selectedIdx]),
            this.hintX + theme.hintIndentBorder, this.hintY + theme.hintIndentBorder);

        //draw values
        var i = 0;
        this.forEachVisibleLine(function (code, line) {
            ctx.fillStyle = this.chart.data.colors[code];
            //value
            this.setFont(ctx, theme.hintValueFontSize, true);
            ctx.fillText(this.chart.data.columns[line.index][this.selectedIdx],
                this.hintX + xArr[i],
                this.hintY + theme.hintIndentBorder + theme.hintTitleFontSize + theme.hintIndentTitleValue);
            //line name
            this.setFont(ctx, theme.hintLineNameFontSize);
            ctx.fillText(this.chart.data.names[code],
                this.hintX + xArr[i],
                this.hintY + theme.hintIndentBorder + theme.hintTitleFontSize + theme.hintIndentTitleValue
                + theme.hintValueFontSize + theme.hintIndentValueName);
            i++;
        });

        //return back global alpha
        ctx.globalAlpha = 1;
    };


    ChartWidget.prototype.drawInternalCanvas = function (ctx, theme) {
        //draw internal canvas to primary canvas
        ctx.clearRect(this.x, this.y, this.w, this.h - theme.xAxisHeight);
        ctx.drawImage(this.canvas, this.x, this.y);
    };

    ChartWidget.prototype.getPointX = function (idx) {
        return (this.x + this.xStep * (idx - this.startIdx) + this.xIndent) | 0;
    };

    ChartWidget.prototype.getPointY = function (idx, lineIdx, value) {
        return (this.y + this.h - this.chart.theme.chartIndent - this.chart.theme.xAxisHeight
            - this.yStep * ((value || this.chart.data.columns[lineIdx][idx]) - this.minValue)) | 0;
    };

    ChartWidget.prototype.processSelectionChanged = function () {
        if (this.end < this.start) return; //transitions in progress
        this.redrawLines = true;
        this.redrawXAxis = true;
        this.xStep = this.w / ((this.end - this.start) * this.strokes);
        var startIdx = Math.floor(this.start * this.strokes) + 1;
        var endIdx = Math.ceil(this.end * this.strokes) + 1;
        if (startIdx !== this.startIdx || endIdx !== this.endIdx) {
            var selectedIndexRangeChanged = true;
        }
        this.startIdx = startIdx;
        this.endIdx = endIdx;
        this.xIndent = -((this.start / (1 / this.strokes)) % 1) * this.xStep;
        if (selectedIndexRangeChanged) {
            this.recalcVertical(); //animate vertically while moving horizontally
        }

        //calculate helper values for x axis draw
        var prevDrawEach = this.drawEach;
        this.drawEach = 1;
        while (this.xStep * this.drawEach < this.xAxisDateWidth) this.drawEach *= 2;
        this.prevDrawEach = this.prevDrawEach || this.drawEach;
        if (prevDrawEach !== this.drawEach) {
            this.prevDrawEach = prevDrawEach;
            if (prevDrawEach < this.drawEach) {
                this.axisVis = 1;
                this.targetAxisVis = 0;
            } else {
                this.axisVis = 0;
                this.targetAxisVis = 1;
            }
        }
    };

    ChartWidget.prototype.selectionChanged = function (start, end) {
        //start,end - values in range 0..1
        if (this.start === undefined && this.end === undefined) {
            this.start = start;
            this.end = end;
            this.processSelectionChanged();
        } else {
            this.addTransition([this.start, this.end], [start, end], 100, this, ['start', 'end'],
                this.processSelectionChanged);
        }
    };

    ChartWidget.prototype.update = function (deltaTime) {
        BaseChart.prototype.update.apply(this, arguments);

        //change visibility for x axis dates, when animate show and hide
        if (this.axisVis !== this.targetAxisVis) {
            this.axisVis = clamp(0, 1, this.axisVis + deltaTime / 300 * (this.axisVis < this.targetAxisVis ? 1 : -1));
            this.redrawXAxis = true;
        }

        //animate y axis
        if (isNaN(this.yAxisAnimation)) {
            this.yAxisAnimation = this.yAxisAnimationTarget;
        } else if (this.yAxisAnimation < this.yAxisAnimationTarget) {
            this.yAxisAnimation += deltaTime / 150;
            if (this.yAxisAnimation > this.yAxisAnimationTarget) {
                this.yAxisAnimation = this.yAxisAnimationTarget;
            }
            this.redrawLines = true;
        } else if (this.yAxisAnimation > this.yAxisAnimationTarget) {
            this.yAxisAnimation -= deltaTime / 150;
            if (this.yAxisAnimation < this.yAxisAnimationTarget) {
                this.yAxisAnimation = this.yAxisAnimationTarget;
            }
            this.redrawLines = true;
        }
    };

    ChartWidget.prototype.onMouseDown = function (x, y) {
        //when touch show hint
        this.onMouseMove(x, y);
    };

    ChartWidget.prototype.onMouseMove = function (x, y) {
        if (this.hit(x, y)) {
            this.showHint(); //show hint when cursor is inside of chart

            //find point for hint show
            var tmp = (this.xStep / 2) | 0;
            for (var i = this.startIdx; i <= this.endIdx; i++) {
                var xx = this.getPointX(i);
                if (xx >= x - tmp && xx <= x + tmp) {
                    if (xx < this.x) {
                        this.selectedIdx = i + 1;
                    } else if (xx > this.x + this.w) {
                        this.selectedIdx = i - 1;
                    } else {
                        this.selectedIdx = i;
                    }
                    break;
                }
            }

            //move hint window to new position
            tmp = this.calcHintWindowWidth(this.selectedIdx);
            var hintWindowWidth = tmp[tmp.length - 1];
            var theme = this.chart.theme;
            var newX = clamp(theme.hintShadowBlur, this.w - hintWindowWidth - theme.hintShadowBlur - theme.hintShadowOffsetX, x);
            var newY = clamp(theme.hintShadowBlur, this.h - this.hintWindowHeightWithShadow - theme.xAxisHeight,
                y - theme.hintWindowDistance - this.hintWindowHeightWithShadow);
            this.addTransition([this.hintX || newX, this.hintY || newY], [newX, newY], 300, this, ['hintX', 'hintY'], this.redrawHint);

        } else {
            //hide hint when cursor is outside of chart
            this.hideHint();
        }
    };

    ChartWidget.prototype.onMouseOut = function () {
        //hide hint when cursor is going out of canvas
        this.hideHint();
    };

    ChartWidget.prototype.showHint = function () {
        if (!this.hintVisible) {
            this.hintVisible = true;
            //clear the coordinates so that the hint appears near the cursor
            this.hintX = this.hintY = undefined;
            //this.hintY = undefined;
            this.addTransition(this.hintAlpha, 1, 200, this, 'hintAlpha', this.redrawHint);
        }
    };

    ChartWidget.prototype.hideHint = function () {
        if (this.hintVisible) {
            this.hintVisible = false;
            this.addTransition(this.hintAlpha, 0, 200, this, 'hintAlpha', this.redrawHint);
        }
    };

    ChartWidget.prototype.redrawHint = function () {
        this.redrawPointsAndHint = true;
    };


    ChartWidget.prototype.calc = function () {
        //calc chart helper values
        var range = this.chart.getValueRange(this.startIdx, this.endIdx);
        var yStep = (this.h - this.chart.theme.chartIndent * 2 - this.chart.theme.xAxisHeight) / (range.max - range.min);
        this.rangeHist = this.rangeHist || [];
        if (this.rangeHist.length === 2) {
            this.rangeHist.shift();
        }
        this.rangeHist.push(range);
        return {
            minValue: range.min,
            maxValue: range.max,
            yStep: isFinite(yStep) ? yStep : 0
        }
    };

    ChartWidget.prototype.visibleLinesChanged = function (code) {
        BaseChart.prototype.visibleLinesChanged.apply(this, arguments);
        //clear cached coordinates for hint window
        this.hintWindowWidth = [];
    };

    ChartWidget.prototype.recalcVertical = function () {
        BaseChart.prototype.recalcVertical.apply(this);
        //y axis animation black magic
        if (this.rangeHist.length === 2) {
            var now = this.rangeHist[1];
            var prev = this.rangeHist[0];
            var range = Math.min(prev.max - prev.min, now.max - now.min);
            var delta = (now.max - prev.max) / range;
            this.yAxisAnimationTarget -= delta > 0.1 ? 1 : (delta < -0.1 ? -1 : 0);
            delta = (now.min - prev.min) / range;
            this.yAxisAnimationTarget -= delta > 0.1 ? 1 : (delta < -0.1 ? -1 : 0);
        }
    };


    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Navigation chart ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    function NavChartWidget(chart, x, y, w, h) {
        BaseChart.apply(this, arguments);
        this.xStep = w / (this.chart.data.columns[0].length - 2); //zero element is column name
        this.selStart = (w * 0.5) | 0;
        this.selEnd = w - 1;
        this.recalcVertical(); //start initial animation
    }

    NavChartWidget.prototype = Object.create(BaseChart.prototype);

    NavChartWidget.prototype.fullRedraw = function () {
        this.redrawLines = true;
    };

    NavChartWidget.prototype.draw = function (ctx, theme) {
        if (this.redrawLines) { //redraw if state changed
            this.redrawLines = false;
            //draw to internal canvas
            var ctxi = this.ctx;
            //clear
            ctxi.fillStyle = theme.background;
            ctxi.fillRect(0, 0, this.w, this.h);
            //draw selection rect
            ctxi.fillStyle = this.chart.theme.navChartFrameColor;
            var t = this.chart.theme.navChartFrameVerticalWidth;
            ctxi.fillRect(this.selStart, 0, t, this.h);
            ctxi.fillRect(this.selEnd - t + 1, 0, t, this.h);
            t = this.chart.theme.navChartFrameHorizontalWidth;
            ctxi.fillRect(this.selStart, 0, this.selEnd - this.selStart, t);
            ctxi.fillRect(this.selStart, this.h - t, this.selEnd - this.selStart, t);
            //draw charts
            for (var code in this.chart.lines) {
                var line = this.chart.lines[code];
                if (line.visibility > 0) {
                    ctxi.beginPath();
                    var x, y;
                    for (var j = 1; j < this.chart.data.columns[line.index].length; j++) {
                        x = this.xStep * (j - 1);
                        y = this.h - theme.navChartIndent - this.yStep * (this.chart.data.columns[line.index][j] - this.minValue);
                        if (j === 1) {
                            ctxi.moveTo(x, y);
                        } else {
                            ctxi.lineTo(x, y);
                        }
                    }
                    ctxi.lineWidth = theme.navChartLineWidth;
                    ctxi.strokeStyle = this.chart.data.colors[code];
                    ctxi.globalAlpha = line.visibility;
                    ctxi.stroke();
                    ctxi.globalAlpha = 1;
                }
            }
            //nav chart mask
            ctxi.fillStyle = theme.navChartMaskColor;
            if (this.selStart > 0) {
                ctxi.fillRect(0, 0, this.selStart, this.h);
            }
            if (this.selEnd < this.w - 1) {
                ctxi.fillRect(this.selEnd + 1, 0, this.w - this.selEnd, this.h);
            }
            //draw internal canvas to primary canvas
            ctx.clearRect(this.x, this.y, this.w, this.h);
            ctx.drawImage(this.canvas, this.x, this.y);
        }
    };


    NavChartWidget.prototype.notifySelectionChanged = function () {
        //notify others that selection changed.
        callForEach(this.chart.objects, 'selectionChanged',
            this.selStart / this.w, //start, end are values in range 0..1
            this.selEnd / (this.w - 1));
    };

    NavChartWidget.prototype.onMouseMove = function (x, y) {
        var frameWidth = this.chart.theme.navChartFrameVerticalWidth;
        if (this.pressed) {
            if (this.hit(x, y)) {
                this.redrawLines = true;
                var dx = x - this.pressedX;
                var start = clamp(0, this.selEnd - frameWidth * 2 + 1, this.selStartWhenPress + dx);
                var end = clamp(this.selStart + frameWidth * 2 - 1, this.w - 1, this.selEndWhenPress + dx);
                switch (this.pressedCursor) {
                    case 'w-resize':
                        this.selStart = start;
                        break;
                    case 'e-resize':
                        this.selEnd = end;
                        break;
                    case 'pointer':
                        var selWidth = this.selEnd - this.selStart;
                        if (dx <= 0) {
                            this.selStart = start;
                            this.selEnd = this.selStart + selWidth;
                        } else {
                            this.selEnd = end;
                            this.selStart = this.selEnd - selWidth;
                        }
                        break;
                }
                this.notifySelectionChanged();//notify others that selection changed
            }
        }
        var setDefault = true;
        var st = this.chart.canvas.style;
        if (this.hit(x, y)) {
            var cursor = this.calcCursor(x, y);
            if (cursor !== undefined) {
                st.cursor = cursor;
                setDefault = false;
            }
        }
        if (setDefault) {
            st.cursor = 'default';
        }
    };

    NavChartWidget.prototype.calcCursor = function (x, y, touch) {
        var increaseZone = touch ? 15 * this.chart.dpr : 0;
        var frameWidth = this.chart.theme.navChartFrameVerticalWidth;
        var start = this.x + this.selStart;
        var leftStart = start - increaseZone;
        var leftEnd = start + frameWidth + increaseZone;
        var end = this.x + this.selEnd;
        var rightStart = end - frameWidth - increaseZone;
        var rightEnd = end + increaseZone;

        if (x - start < end - x) { //which slider is closer?
            if (x >= leftStart && x <= leftEnd) return 'w-resize';
            if (x >= rightStart && x <= rightEnd) return 'e-resize';
        } else {
            if (x >= rightStart && x <= rightEnd) return 'e-resize';
            if (x >= leftStart && x <= leftEnd) return 'w-resize';
        }

        if (x > leftEnd && x < rightStart) return 'pointer';
    };

    NavChartWidget.prototype.onMouseDown = function (x, y, touch) {
        if (this.hit(x, y)) {
            this.pressed = true;
            this.pressedX = x;
            this.pressedCursor = this.calcCursor(x, y, touch);
            this.selStartWhenPress = this.selStart;
            this.selEndWhenPress = this.selEnd;
        }
    };

    NavChartWidget.prototype.onMouseUp = function () {
        this.pressed = false;
    };

    NavChartWidget.prototype.onMouseOver = function (e) {
        if (e.buttons !== 1) {
            this.pressed = false;
        }
    };

    NavChartWidget.prototype.calc = function () {
        //calc chart helper values
        var range = this.chart.getValueRange();
        var yStep = (this.h - this.chart.theme.navChartIndent * 2) / (range.max - range.min);
        return {
            minValue: range.min,
            yStep: isFinite(yStep) ? yStep : 0
        }
    };

    NavChartWidget.prototype.visibleLinesChanged = function (code) {
        BaseChart.prototype.visibleLinesChanged.apply(this, arguments);

        if (code !== undefined) {
            //start change alpha channel of line color
            var line = this.chart.lines[code];
            this.addTransition(line.visibility, line.visible ? 1 : 0, 300, line, 'visibility', this.triggerRedrawLines);
        }
    };

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Button ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    function ButtonWidget(chart, code, text, color, x, y) {
        this.setFont(chart.ctx, chart.theme.buttonFontSize);
        Obj.call(this, chart, x, y, this.getTextWidth(chart.ctx, text) + chart.theme.buttonCircleRadius * 5, chart.theme.buttonHeight);
        this.code = code;
        this.text = text;
        this.color = color;
        this.checked = true;
        this.visibility = 1;
        this.redraw = true;
    }

    ButtonWidget.prototype = Object.create(Obj.prototype);

    ButtonWidget.prototype.fullRedraw = function () {
        this.redraw = true;
    };

    ButtonWidget.prototype.draw = function (ctx, theme) {
        if (this.redraw) {
            this.redraw = false;
            //clear
            var dpr = this.chart.dpr;
            ctx.fillStyle = theme.background;
            ctx.fillRect(this.x - 2 * dpr, this.y - 2 * dpr, this.w + 4 * dpr, this.h + 4 * dpr); //bit bigger square, because interpolation
            //border
            ctx.strokeStyle = theme.buttonBorderColor;
            ctx.lineWidth = theme.buttonBorderWidth;
            var halfHeight = this.h / 2;
            ctx.beginPath();
            ctx.arc(this.x + halfHeight, this.y + halfHeight, halfHeight, 0.5 * Math.PI, 1.5 * Math.PI);
            ctx.lineTo(this.x + this.w - halfHeight, this.y);
            ctx.arc(this.x + this.w - halfHeight, this.y + halfHeight, halfHeight, 1.5 * Math.PI, 0.5 * Math.PI);
            ctx.lineTo(this.x + halfHeight, this.y + this.h);
            ctx.stroke();
            //colored circle
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x + halfHeight, this.y + halfHeight, theme.buttonCircleRadius, 0, 2 * Math.PI);
            ctx.fill();
            //mark
            ctx.strokeStyle = theme.buttonMarkColor;
            ctx.lineWidth = theme.buttonCircleRadius / 5;
            ctx.beginPath();
            ctx.moveTo(this.x + halfHeight - theme.buttonCircleRadius / 2, this.y + halfHeight);
            ctx.lineTo(this.x + halfHeight - theme.buttonCircleRadius / 8, this.y + halfHeight + theme.buttonCircleRadius / 3);
            ctx.lineTo(this.x + halfHeight + theme.buttonCircleRadius / 2, this.y + halfHeight - theme.buttonCircleRadius / 3);
            ctx.stroke();
            //empty circle
            if (this.visibility < 1) {
                ctx.fillStyle = theme.background;
                ctx.beginPath();
                ctx.arc(this.x + halfHeight, this.y + halfHeight, (theme.buttonCircleRadius - theme.buttonBorderWidth) * (1 - this.visibility), 0, 2 * Math.PI);
                ctx.fill();
            }
            //label
            this.setFont(ctx, theme.buttonFontSize);
            ctx.fillStyle = theme.buttonFontColor;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(this.text, this.x + this.h * 1.2, this.y + halfHeight);
        }
    };

    ButtonWidget.prototype.onMouseDown = function (x, y) {
        if (this.hit(x, y)) {
            this.checked = !this.checked;
            this.chart.lines[this.code].visible = this.checked;
            callForEach(this.chart.objects, 'visibleLinesChanged', this.code);
            this.addTransition(this.visibility, this.checked ? 1 : 0, 150, this, 'visibility', function () {
                this.redraw = true
            });
        }
    };

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // API ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    opexcharts.Chart = Chart;

    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // Themes ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    opexcharts.dayTheme = {
        background: '#ffffff',
        axisLineColor: '#dddddd',
        axisLineWidth: 0.5,
        hintBackground: '#ffffff',
        hintTitleColor: '#404040',
        hintTitleFontSize: 12,
        hintValueFontSize: 14,
        hintLineNameFontSize: 10,
        hintIndentBorder: 8,
        hintIndentTitleValue: 8,
        hintIndentValueName: 3,
        hintShadow: 'rgba(0,0,0,0.3)',
        hintShadowBlur: 4,
        hintShadowOffsetX: 1,
        hintShadowOffsetY: 1,
        hintWindowRoundCorner: 10,
        hintWindowDistance: 30,
        axisFontSize: 10,
        axisFontColor: "#999999",
        xAxisHeight: 30,
        chartLineWidth: 2,
        chartIndent: 10,
        chartDotRadius: 5,
        chartDotThickness: 2,
        navChartLineWidth: 1,
        navChartHeight: 40,
        navChartIndent: 5,
        navChartMaskColor: 'rgba(235,245,250,0.6)',
        navChartFrameColor: '#c6dee8',
        navChartFrameVerticalWidth: 10,
        navChartFrameHorizontalWidth: 1,
        buttonHeight: 30,
        buttonInterval: 10,
        buttonFontSize: 15,
        buttonFontColor: '#404040',
        buttonBorderColor: '#bbbbbb',
        buttonBorderWidth: 1,
        buttonCircleRadius: 10,
        buttonMarkColor: '#ffffff',
        buttonBorderIndent: 5,
        componentInterval: 10
    };

    opexcharts.nightTheme = {
        background: '#536471',
        axisLineColor: 'rgba(200,200,200,0.4)',
        axisLineWidth: 0.5,
        hintBackground: '#60727f',
        hintTitleColor: '#ffffff',
        hintTitleFontSize: 12,
        hintValueFontSize: 14,
        hintLineNameFontSize: 10,
        hintIndentBorder: 8,
        hintIndentTitleValue: 8,
        hintIndentValueName: 3,
        hintShadow: 'rgba(0,0,0,1)',
        hintShadowBlur: 4,
        hintShadowOffsetX: 1,
        hintShadowOffsetY: 1,
        hintWindowRoundCorner: 10,
        hintWindowDistance: 30,
        axisFontSize: 10,
        axisFontColor: "#93aeba",
        xAxisHeight: 30,
        chartLineWidth: 2,
        chartIndent: 10,
        chartDotRadius: 5,
        chartDotThickness: 2,
        navChartLineWidth: 1,
        navChartHeight: 40,
        navChartIndent: 5,
        navChartMaskColor: 'rgba(60,60,60,0.4)',
        navChartFrameColor: '#567d90',
        navChartFrameVerticalWidth: 10,
        navChartFrameHorizontalWidth: 1,
        buttonHeight: 30,
        buttonInterval: 10,
        buttonFontSize: 15,
        buttonFontColor: '#ffffff',
        buttonBorderColor: '#628598',
        buttonBorderWidth: 1,
        buttonCircleRadius: 10,
        buttonMarkColor: '#ffffff',
        buttonBorderIndent: 5,
        componentInterval: 10
    };

}(window.opexcharts = window.opexcharts || {});
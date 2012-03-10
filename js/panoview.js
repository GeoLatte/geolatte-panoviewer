/*
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Copyright (c) 2012, Geovise BVBA

*/

/*
A PanoViewer is a component that turns a canvas element into a viewer
for Panoramic images.
*/

/* Author: Karel Maesen, Geovise BVBA */


var PanoViewer = function (canvas) {
    var self = {
        ZOOM_STEP : 0.20,       //default zoom-step for mouse wheel events.
        canvasContext : null,   //the 2D context for the images
        canvasElement : null,   //HTML element for the canvas.
        CAMERA_HEIGHT: 1.6 , //Camera is mounted 1.6 m. above ground-level
        currentRecordingLocation: {x: 0, y: 0, z: 0}, // the recording location for the current image (in map coordinates).
        img : null,             // image source for the panorama
        pov : {yaw: 0.0,        //view angle in horizontal plane
                 pitch: 0.0,    //view angle in vertical plane
                 zoom: 1.0},    //zoom factor = # canvasPixel / sourcePixel
        sourceInfo: {},
        currentTarget: null,	  //the current target is the image pixel that is "targeted" by a cursor.
        hFov : function () {
            return self.canvasElement.width * self.currentDegPerCanvasPixelX();
        },
        vFov : function () {
            return self.canvasElement.height * self.currentDegPerCanvasPixelY();
        },
        loadImageSrc : function (url, recordingLocation, pov) {
            self.img = new Image();
            self.img.src = url;
            if (recordingLocation) {
                self.copyLocation(recordingLocation, self.currentRecordingLocation);
            }
            self.img.addEventListener('load', function(){
                //notify listeners that image is loaded
                self.fireEvent('image-load');
                if (pov) {
                    self.copyPov(pov, self.pov);
                }
                self.initSourceInfo(self.img);
                self.drawImage();
            }, false);
            self.img.addEventListener('error', function(){
                //notify listener that image is loaded
                self.fireEvent('image-load-error');
            }, false);
        },
        initSourceInfo : function (imageSrc) {
            self.sourceInfo.width = imageSrc.naturalWidth;
            self.sourceInfo.height = imageSrc.naturalHeight;
            self.sourceInfo.degPerSrcPixelX = 360 / self.sourceInfo.width;
            self.sourceInfo.degPerSrcPixelY = 180 / self.sourceInfo.height;
        },
        drawImage : function () {         
            var sourceTopLeft = self.sourceTopLeft();
            //TODO  -- improve documentation.
            //calculate the image parts
            var srcHeight = self.canvasElement.height / self.pov.zoom;
            var srcWidth = self.canvasElement.width / self.pov.zoom;
            var w1, w2;
            // invariants : srcWidth == w1 + w2 ; self.viewelement.width == canvasW1 + canvasW2
            if ( (sourceTopLeft.x + srcWidth ) <= self.sourceInfo.width) {              
                w1 = srcWidth;
                w2 =0;                
            } else {
              //the view-port wraps around to the left-side of the panorama image.
                w1 = self.sourceInfo.width - sourceTopLeft.x;
                w2 = srcWidth - w1;
            }
            var canvasW1 = w1 * self.pov.zoom;
            var canvasW2 = w2 * self.pov.zoom;

            self.canvasContext.drawImage(self.img,
                    sourceTopLeft.x, sourceTopLeft.y, w1, srcHeight,
                    0,0, canvasW1, self.canvasElement.height);

            if (w2 >  0) { // in case of wrap-around
                self.canvasContext.drawImage(self.img,
                        0, sourceTopLeft.y, w2, srcHeight,
                        canvasW1,0, canvasW2, self.canvasElement.height);
            }
            //draw the current target
            if( self.currentTarget ) {
               self.drawCursorOnPosition(self.canvasPixel(self.currentTarget));
            }
            self.fireEvent('view-update', {yaw :self.pov.yaw,
                                                     pitch: self.pov.pitch,
                                                     zoom: self.pov.zoom,
                                                     hFov: self.hFov(),
                                                     vFov: self.vFov()});
        },
        sourceTopLeft : function () {
            var leftEdgeYaw = self.normalizeX(self.pov.yaw - self.hFov()/2);
            var sx = (leftEdgeYaw + 180)/self.sourceInfo.degPerSrcPixelX;
            var topEdgePitch = self.pov.pitch + self.vFov()/2;
            var sy = (90 - topEdgePitch)/self.sourceInfo.degPerSrcPixelY;
            return {x: sx,y: sy};
        },
        updatePov : function (newPov) {
            if(newPov) {
                self.copyPov(newPov, self.pov);
            }
            self.drawImage();
        },
        copyPov : function (srcPov, destPov) {
            if (srcPov.yaw != null) destPov.yaw =  self.normalizeX(srcPov.yaw);
            if (srcPov.pitch != null) destPov.pitch = self.clampY(srcPov.pitch);
            if (srcPov.zoom != null) destPov.zoom = srcPov.zoom;
        },
        copyLocation : function(srcPos, destPos){
            if( srcPos.x != null) destPos.x = srcPos.x;
            if( srcPos.y != null) destPos.y = srcPos.y;
            if( srcPos.z != null) destPos.z = srcPos.z;
        },
        onMouseDown : function (ev) {
            ev.preventDefault();
            var panStart = {x : ev.clientX, y: ev.clientY};
            var povStart = {yaw : self.pov.yaw, pitch : self.pov.pitch};
            //create the mousemove handler
            var moveHandler = function (ev) {
                ev.preventDefault();
                var dx = (ev.clientX - panStart.x);
                var dy = (ev.clientY - panStart.y);
                var dyaw = dx*self.currentDegPerCanvasPixelX();
                var dpitch = dy*self.currentDegPerCanvasPixelY();
                self.pov.yaw = self.normalizeX(povStart.yaw - dyaw);
                self.pov.pitch = self.clampY(povStart.pitch + dpitch);
                self.drawImage();
            };
            //.. and the function to remove the mouse-move handler on mouseup or mouseout
            var removeListeners = function (ev) {
                ev.preventDefault();
                self.canvasElement.removeEventListener('mousemove', moveHandler, false);
                self.canvasElement.removeEventListener('mouseout', removeListeners, false);
                self.canvasElement.removeEventListener('mouseup', removeListeners, false);

            };
            self.canvasElement.addEventListener('mousemove', moveHandler, false);
            self.canvasElement.addEventListener('mouseout', removeListeners, false);
            self.canvasElement.addEventListener('mouseup', removeListeners, false);

        },
        onScroll: function (ev) {
            ev.preventDefault();
            //first get the source pixel under the current mouse cursor
            var oldCanvasPixel = self.mousePosition(ev);
            var srcPixel = self.srcPixel(oldCanvasPixel);
            //set the zoom-factor
            self.pov.zoom = self.stepZoom(self.wheelEventSteps(ev));
            //get the canvaslocation of the srcPixel (after zoom)
            var newCanvasPixel = self.canvasPixel(srcPixel);
            //derive the delta between the canvas-pixel of srcPixel before and after zoom
            var delta = { x: (newCanvasPixel.x - oldCanvasPixel.x) , y: (newCanvasPixel.y-oldCanvasPixel.y)};
            // this delta needs to be compensated by changing POV
            var yaw = self.pov.yaw + delta.x*self.currentDegPerCanvasPixelX();
            var pitch = self.pov.pitch - delta.y*self.currentDegPerCanvasPixelY();
            self.updatePov({yaw: yaw, pitch: pitch});
        },
        stepZoom : function (steps) {
            //each step is a ZOOM_STEP % magnification (default: 20%).
            return self.zoomClamp(self.pov.zoom * (1 - steps * self.ZOOM_STEP));
        },
        povFromCursorPosition : function (pos) {
            var yaw = self.normalizeX(self.pov.yaw - self.hFov()/2 + pos.x*self.currentDegPerCanvasPixelX());
            var pitch = self.clampY(self.pov.pitch + self.vFov()/2 - pos.y*self.currentDegPerCanvasPixelY());
            return {yaw: yaw, pitch: pitch};
        },
        srcPixel : function (canvasPixel) {
            var sourceTopLeft = self.sourceTopLeft();
            var srcX = sourceTopLeft.x + canvasPixel.x / self.pov.zoom;
            var srcY = sourceTopLeft.y + canvasPixel.y / self.pov.zoom;
            return {x: srcX, y: srcY};
        },
        canvasPixel : function (srcPixel) {
            var sourceTopLeft = self.sourceTopLeft();
            //displayable part of source
            var srcWidth = self.canvasContext.canvas.width / self.pov.zoom;
            var srcW1 = self.sourceInfo.width - sourceTopLeft.x;
            var srcW2 = srcWidth - srcW1;
            if (srcPixel.x < srcW2) {
                //srcPixel is wrapped around on the canvas
                var canvasX = (srcW1 + srcPixel.x) * self.pov.zoom;                
            } else {
                var canvasX = (srcPixel.x - sourceTopLeft.x) * self.pov.zoom;
            }
            var canvasY = (srcPixel.y - sourceTopLeft.y) * self.pov.zoom;
            return {x: canvasX, y: canvasY};
        },
        registerBearing : function(){
            var moveHandler = function (ev) {
                ev.preventDefault();
                var mousePosition = self.mousePosition(ev);
                self.currentTarget = self.srcPixel(mousePosition);
                self.drawImage();
            };
            //.. and the function to remove the mouse-move handler on mouseup or mouseout
            var clickListener = function (ev) {
                ev.preventDefault();
                self.fireEvent('bearing-registered', self.toBearing(self.currentTarget));
                self.canvasElement.removeEventListener('mousemove', moveHandler, false);
                self.canvasElement.removeEventListener('click', clickListener, false);

            };
            self.canvasElement.addEventListener('mousemove', moveHandler, false);
            self.canvasElement.addEventListener('click', clickListener, false);
        },
        drawCursorOnPosition : function(pos){
            self.canvasContext.save();
            self.canvasContext.strokeStyle = 'red';
            self.canvasContext.lineWidth = 1;
            self.canvasContext.beginPath();
            self.canvasContext.moveTo(0, pos.y);
            self.canvasContext.lineTo(self.canvasContext.canvas.width, pos.y);
            self.canvasContext.moveTo(pos.x, 0);
            self.canvasContext.lineTo(pos.x, self.canvasContext.canvas.height);
            self.canvasContext.stroke();
            self.canvasContext.closePath();
            self.canvasContext.restore();
        },
        mousePosition : function (e) {
            var x;
            var y;
            if (e.layerX || e.layerY){
                return {x: e.layerX, y:e.layerY};
            }
            if (e.pageX || e.pageY){
                x = e.pageX;
                y = e.pageY;
            } else {
                x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
                y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
            }

            var currentElement = self.canvasElement;
            var totalOffsetX =0;
            var totalOffsetY = 0;
            do{
                totalOffsetX += currentElement.offsetLeft;
                totalOffsetY += currentElement.offsetTop;
            }
            while(currentElement = currentElement.offsetParent)
            x = x - totalOffsetX;
            y = y - totalOffsetY;
            return { x : x, y : y };
        },
        //Ensures that all x-values are within [-180, 180]
        //but allows full rotation around panorama.
        normalizeX : function (x) {
            if (x < -180) return 360 + x;
            if (x > 180) return x - 360;
            return x;
        },
        toBearing : function(srcPixel){
            return {
               yaw: -180 + srcPixel.x * self.sourceInfo.degPerSrcPixelX,
               pitch: 90 - srcPixel.y * self.sourceInfo.degPerSrcPixelY
            };
        },
        //inverse of "toBearing"
        srcPixelFromBearing : function(bearing){
            return {
                x : (bearing.yaw + 180)/self.sourceInfo.degPerSrcPixelX,
                y : (90 - bearing.pitch)/self.sourceInfo.degPerSrcPixelY
            };
        },
        currentDegPerCanvasPixelX : function () {
            return self.sourceInfo.degPerSrcPixelX/self.pov.zoom;
        },
        currentDegPerCanvasPixelY : function () {
            return self.sourceInfo.degPerSrcPixelY/self.pov.zoom;
        },
        //Ensures that all y-values are clamped so
        //that the view-port never exceeds [-90,90]
        clampY : function (y) {
            var maxAngle = 90 - self.vFov()/2;
            if (y < -maxAngle) return -maxAngle;
            if (y > maxAngle) return maxAngle;
            return y;
        },
        zoomClamp : function (zoom) {
            //determine minZoom so that hFov() < 180 and vFov() < 90
            var minZoomX = self.canvasElement.width * self.sourceInfo.degPerSrcPixelX/180.0;
            var minZoomY = self.canvasElement.height* self.sourceInfo.degPerSrcPixelY/90.0;
            var minZoom = Math.max(minZoomX, minZoomY);
            if (zoom < minZoom) return minZoom;
            if (zoom > 10) return 10;
            return zoom;
        },
        wheelEventSteps : function (ev) {
            if (ev.type == 'DOMMouseScroll') { //FF
                return ev.detail / 3.0;
            }
            return - ev.wheelDelta / 120.0;
        }
    };

    //mixin the event mechanism for the listed events
    panoMixin(self, new PanoEvents(['view-update', 'image-load', 'image-load-error', 'bearing-registered']));

    //mixin common trigonometic functions
    panoMixin(self, new PanoTrigonometry());
    
    //create the canvas context
    self.canvasElement = canvas;
    if (canvas.getContext) {
        self.canvasContext = canvas.getContext('2d');
    }
    canvas.addEventListener('mousedown', self.onMouseDown, false);
    canvas.addEventListener('mousewheel', self.onScroll, false);
    //for FF
    canvas.addEventListener('DOMMouseScroll', self.onScroll, false);

    return self;
};

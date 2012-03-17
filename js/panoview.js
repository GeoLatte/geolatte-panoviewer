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

var Pano = {};

/*
 * A set of common interpolators. Takes fractional pixel coordinates and
 * and ImageData structure, and returns the interpolated pixel at the specified
 * (fractional) pixel coordinate.
 */
Pano.interp = {
    getComponent : function(imageData, x,y, comp){
        return imageData.data[4*(imageData.width*y + x) + comp];
    },
    nearestNeighbor : function(imageData, pixel, outImageData, destOffset) {
        var x,y;
        x = Math.round(pixel.x);
        y = Math.round(pixel.y);
        var srcOffset = 4*(imageData.width*y + x);
        var idx = 4;
        while (idx--){
            outImageData.data[destOffset + idx] = imageData.data[srcOffset+idx];
        }
    },
    bilinear : function(imageData, pixel, outImageData, destOffset) {        
        var u = Math.floor(pixel.x);
        var v = Math.floor(pixel.y);
        var a = pixel.x - u;
        var b = pixel.y - v;                
        var component = 4;
        while (component--){
            var A = Pano.interp.getComponent(imageData,u,v,component);
            var B = Pano.interp.getComponent(imageData,u+1,v,component);
            var C = Pano.interp.getComponent(imageData,u,v+1,component);
            var D = Pano.interp.getComponent(imageData,u+1,v+1,component);
            var E = A + a*(B-A);
            var F = C + a*(D-C);                        
            outImageData.data[destOffset + component] = E + b*(F-E);
        }
    }
    
};

Pano.projection = {

        
    canvasToEquirect : function(viewer){
        var leftEdgeYaw = viewer.normalizeX(viewer.pov.yaw - viewer.hFov()/2);
        var topEdgePitch = viewer.pov.pitch + viewer.vFov()/2;
        var sx = (leftEdgeYaw + 180)/viewer.sourceInfo.degPerSrcPixelX;            
        var sy = (90 - topEdgePitch)/viewer.sourceInfo.degPerSrcPixelY;
        //displayable part of source
        var srcWidth = viewer.canvasContext.canvas.width / viewer.pov.zoom;
        var srcW1 = viewer.sourceInfo.width - sx;
        var srcW2 = srcWidth - srcW1;
        var canvW1 = srcW1 * viewer.pov.zoom;
        var canvW2 = srcW2 * viewer.pov.zoom;
        return function(x,y, projected) {
            var srcX, srcY;
            if (x < canvW1) {
                srcX = sx + x / viewer.pov.zoom;
            } else {
                srcX = (x - canvW1) / viewer.pov.zoom;
            }
            srcY = sy + y/viewer.pov.zoom;
            projected.x = srcX;
            projected.y = srcY;
        }        
    },
    equirectToCanvas : function(viewer){
        var leftEdgeYaw = viewer.normalizeX(viewer.pov.yaw - viewer.hFov()/2);
        var topEdgePitch = viewer.pov.pitch + viewer.vFov()/2;
        var sx = (leftEdgeYaw + 180)/viewer.sourceInfo.degPerSrcPixelX;            
        var sy = (90 - topEdgePitch)/viewer.sourceInfo.degPerSrcPixelY;
        var srcWidth = viewer.canvasContext.canvas.width / viewer.pov.zoom;
        var srcW1 = viewer.sourceInfo.width - sx;
        var srcW2 = srcWidth - srcW1;
        return function(x,y, projected) {
            if (x < srcW2) {
                //srcPixel is wrapped around on the canvas
                var projX = (srcW1 + x) * viewer.pov.zoom;                
            } else {
                var projX = (x - sx) * viewer.pov.zoom;
            }
            var projY = (y - sy) * viewer.pov.zoom;
            projected.x = projX;
            projected.y = projY;
        }
    }
};

var PanoViewer = function (canvas) {
    var self = {
        ZOOM_STEP : 0.20,       //default zoom-step for mouse wheel events.         
        canvasContext : null,   //the 2D context for the images
        canvasElement : null,   //HTML element for the canvas.
        CAMERA_HEIGHT: 2.2 , //Camera is mounted 2.2 m. above ground-level
        currentRecordingLocation: {x: 0, y: 0, z: 0}, // the recording location for the current image (in map coordinates).
        img : null,             // image source for the panorama
        pov : {yaw: 0.0,        //view angle in horizontal plane
                 pitch: 0.0,    //view angle in vertical plane
                 zoom: 1.0},    //zoom factor = # canvasPixel / sourcePixel
        interpolator : Pano.interp.bilinear,    // the image interpolation function (a member of PanoInterp)       
        sourceInfo: {},
        currentTarget: null,	  //the current target is the image pixel that is "targeted" by a cursor.
        hFov : function () {
            return self.canvasElement.width * self.currentDegPerCanvasPixelX();
        },
        vFov : function () {
            return self.canvasElement.height * self.currentDegPerCanvasPixelY();
        },
        imageDataContext : null,       //image data buffer (holds the complete panoramic image
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
                var srcEl = document.createElement('canvas');
                srcEl.width = self.sourceInfo.width;
                srcEl.height = self.sourceInfo.width;
                self.imageDataContext = srcEl.getContext('2d');
                self.imageDataContext.drawImage(self.img, 0,0, 4800, 2400);                            
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

            //the target to source projection
            var proj = Pano.projection.canvasToEquirect(self);
            var imgData = self.canvasContext.createImageData(self.canvasContext.canvas.width, self.canvasContext.canvas.height);
            var imgSrc = self.imageDataContext.getImageData(0,0,self.imageDataContext.canvas.width, self.imageDataContext.canvas.height);
            var width = imgData.width;
            var height = imgData.height;
            var srcHeight = imgSrc.height;            
            var interp = self.interpolator;
            
            var idx = 0;
            var srcPixel = {};
            for (var y = 0; y < height; y += 1) {
                for (var x = 0; x < width; x += 1) {
                    proj(x,y, srcPixel);
                    interp(imgSrc, srcPixel, imgData, 4*(y*width + x));
                }
            }
            self.canvasContext.putImageData(imgData,0,0);

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
            };
            //.. and the function to remove the mouse-move handler on mouseup or mouseout
            var removeListenersAndRedraw = function (ev) {
                ev.preventDefault();
                self.canvasElement.removeEventListener('mousemove', moveHandler, false);
                self.canvasElement.removeEventListener('mouseout', removeListenersAndRedraw, false);
                self.canvasElement.removeEventListener('mouseup', removeListenersAndRedraw, false);
                self.drawImage();

            };
            self.canvasElement.addEventListener('mousemove', moveHandler, false);
            self.canvasElement.addEventListener('mouseout', removeListenersAndRedraw, false);
            self.canvasElement.addEventListener('mouseup', removeListenersAndRedraw, false);

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
            var result = {};
            var proj = Pano.projection.canvasToEquirect(self);
            proj(canvasPixel.x, canvasPixel.y, result);
            return result;
        },
        canvasPixel : function (srcPixel) {
            var result = {};
            var proj = Pano.projection.equirectToCanvas(self);
            proj(srcPixel.x, srcPixel.y, result);
            return result;
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
    } else {
        throw "Not a canvas element"
    }
    
    canvas.addEventListener('mousedown', self.onMouseDown, false);
    canvas.addEventListener('mousewheel', self.onScroll, false);
    //for FF
    canvas.addEventListener('DOMMouseScroll', self.onScroll, false);

    return self;
};

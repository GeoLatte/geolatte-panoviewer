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
A POVSymbolizer draws on a canvas the Point-of-View of one or more PanoViewers in the horizontal plane.
*/

/* Author: Karel Maesen, Geovise BVBA */

function POVSymbolizer (){	
   var self;	 
   self = {
      MIN_EXTENT_DIMENSION : 100, //minimum value of the extent
      mapExtent: {x: 0, x: 0, width: 0, height: 0}, // the map extent the encompasses the tracked PanoViewers. (x, y, width and height) with X,Y Upper-left corner
      canvasContext : null,   //the 2D context for the images
      canvasElement : null,   //HTML element for the canvas.
      mapScale : 1, //pixels per mapUnits
      backgroundColor: '#FFFFFF',
      aspectRatio: 1, //aspect-ratio of the  canvas element (width/height)
      viewers: [], // the PanoViewers to track.
      init : function(/*the canvas element*/canvas, /*an optional background color as an RGB String*/ rgb){
         self.canvasElement = canvas;
         if (canvas.getContext) {
            self.canvasContext = canvas.getContext('2d');
         } else {
            throw "Need a canvas element"; 
         }
         self.aspectRatio = self.canvasElement. width / self.canvasElement.height;
         if(rgb) {
            self.backgroundColor = rgb;
         }
         self.update();                   
      },
      //TODO -- registerViewer uses position argument. Should use current recording location
      registerViewer : function(panoViewer, pos){
         if ( !pos || !panoViewer ) throw "Required arguments missing";
         //listen to the view-update events of the viewer
         panoViewer.on('view-update', self.createViewUpdateListener(panoViewer));
         //listen to the bearing-registered events of the viewer
         panoViewer.on('bearing-registered', self.createBearingRegisteredListener(panoViewer));      	
         //add to the tracked viewer list      	
         self.viewers.push({viewer: panoViewer, imgData: {x: pos.x, y: pos.y, z: pos.z}});
         //update the map extent
         self.updateMapExtent();
         //update the canvas
         self.update();
      },
      update : function(){
         self.canvasContext.fillStyle = self.backgroundColor;
         self.canvasContext.fillRect(0,0, self.canvasElement.width, self.canvasElement.height);
         if ( self.viewers.length === 0 ) return; //break if we don't have anything else to do
         self.canvasContext.save();
         self.updateCanvasTransform();
         self.drawViewers();
         self.canvasContext.restore();
      },
      drawViewers: function(){         
         for (var vIdx = 0, max = self.viewers.length; vIdx < max; vIdx +=1){
            var viewerData = self.viewers[vIdx].imgData;
            self.drawViewerPov(viewerData);                  		      		
            if ( viewerData.bearing ) {
               self.drawViewerTarget(viewerData);		
            }         
         }      	
      },
      drawViewerPov: function(viewerData){
         self.canvasContext.fillStyle = '#0000FF';  //blue
         var maxLineLength = 1.5*Math.max(self.mapExtent.width, self.mapExtent.height);
         var size = 5 / self.mapScale ;  //5 px  
         self.canvasContext.fillRect(viewerData.x, viewerData.y, size, size);            
         self.canvasContext.globalAlpha = 0.25;
         self.canvasContext.beginPath();
         self.canvasContext.moveTo(viewerData.x, viewerData.y);
         var maxAngle = (viewerData.yaw + viewerData.hFov/2) * Math.PI / 180;
         var minAngle = (viewerData.yaw - viewerData.hFov/2) * Math.PI / 180;              
         self.canvasContext.lineTo(viewerData.x + maxLineLength*Math.sin(maxAngle), viewerData.y + maxLineLength*Math.cos(maxAngle));
         self.canvasContext.lineTo(viewerData.x + maxLineLength*Math.sin(minAngle), viewerData.y + maxLineLength*Math.cos(minAngle));
         self.canvasContext.fill();				
         self.canvasContext.closePath();
      },
      drawViewerTarget: function(viewerData){
         var maxLineLength = 1.5*Math.max(self.mapExtent.width, self.mapExtent.height);
         self.canvasContext.globalAlpha = 1.0;
         self.canvasContext.strokeStyle = 'red';
         self.canvasContext.lineWidth = 2 / self.mapScale; // 2 px
         var yaw = viewerData.bearing.yaw * Math.PI / 180;				
         self.canvasContext.beginPath();
         self.canvasContext.moveTo(viewerData.x, viewerData.y);				
         self.canvasContext.lineTo(viewerData.x + maxLineLength*Math.sin(yaw), viewerData.y + maxLineLength*Math.cos(yaw));
         self.canvasContext.stroke();
         self.canvasContext.closePath();      	
      },
      updateMapExtent : function() {
         var minWidth, minHeight;
         if (self.aspectRatio < 1.0) {
            minHeight = self.MIN_EXTENT_DIMENSION;
            minWidth = self.aspectRatio * minHeight;
         } else {
            minWidth = self.MIN_EXTENT_DIMENSION;
            minHeight = minWidth/self.aspectRatio;      		
         }
         var minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
         var maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
         for (var vIdx = 0, max = self.viewers.length; vIdx < max; vIdx += 1){
            if (minX > self.viewers[vIdx].imgData.x) minX =  self.viewers[vIdx].imgData.x;
            if (minY > self.viewers[vIdx].imgData.y) minY =  self.viewers[vIdx].imgData.y;
            if (maxX < self.viewers[vIdx].imgData.x) maxX =  self.viewers[vIdx].imgData.x;
            if (maxY < self.viewers[vIdx].imgData.y) maxY =  self.viewers[vIdx].imgData.y; 
         }
         self.mapExtent.x = minX - minWidth/2;
         self.mapExtent.y = maxY + minHeight/2;
         self.mapExtent.width = maxX - minX + minWidth;
         self.mapExtent.height = maxY - minY + minHeight;      	      	
      },
      updateCanvasTransform : function(){
         var scale = Math.max(self.canvasElement.width / self.mapExtent.width, self.canvasElement.height / self.mapExtent.height);
         self.mapScale = scale;      	
         self.canvasContext.setTransform(scale, 0, 0, -scale, - scale*self.mapExtent.x, scale*self.mapExtent.y);      	      	
      },
      viewerInfo: function(viewer){
         var i = self.viewers.length;
         while (i--){
            if (self.viewers[i].viewer === viewer) {
               return self.viewers[i];
            }
         }
      },
      createViewUpdateListener : function(viewer){         
         return function(ev){      		
            var viewerInfo = self.viewerInfo(viewer);
            viewerInfo.imgData.hFov = ev.hFov;
            viewerInfo.imgData.yaw = ev.yaw;         	
            self.update();
         };
      },
      createBearingRegisteredListener : function(viewer){
         return function(ev){
            var viewerInfo = self.viewerInfo(viewer);
            viewerInfo.imgData.bearing = {yaw: ev.yaw, pitch: ev.pitch};
            self.update();
         };
      }
   };
   return self;
};

function PanoImageData(/*position hash in map-coordinates*/ position){
   var x = 0;
   var y = 0;
   var z = 0;
   if (position.x != null) x = position.x;
   if (position.y != null) y = position.y;
   if (position.z != null) y = position.z;
   return {x: x, y: y, z: z};	
}



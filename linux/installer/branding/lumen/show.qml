import QtQuick 2.0;
import calamares.slideshow 1.0;

Presentation
{
    id: presentation

    Slide {
        Rectangle {
            anchors.fill: parent
            color: "#08091a"

            Image {
                id: lumenArtwork
                source: "lumen-welcome.png"
                width: parent.width
                height: parent.height - 72
                fillMode: Image.PreserveAspectFit
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.top: parent.top
            }

            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.top: lumenArtwork.bottom
                width: parent.width - 48
                color: "#eeeafa"
                text: qsTr("Lumen OS is being installed. The future has a soul.")
                wrapMode: Text.WordWrap
                horizontalAlignment: Text.AlignHCenter
                font.pixelSize: 18
            }
        }
    }
}
